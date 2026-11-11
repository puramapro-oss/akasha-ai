// =============================================================================
// AKASHA AI — POST /api/connect/withdraw (V4.1 Axe 3)
//
// Retire le solde wallet vers le compte Stripe Connect de l'user authentifié.
// Seuil min 20€ (brief STRIPE_CONNECT_KARMA_V4.md §Grille frais).
//
// Flux :
//   1. Auth
//   2. Zod body {amount_eur?: number} (défaut = balance complet)
//   3. RPC get_wallet_balance_akasha → balance check
//   4. RPC debit_wallet_for_withdrawal_akasha (atomique)
//   5. Vérif connect_accounts.payouts_enabled=true
//   6. stripe.transfers.create(destination=stripe_account_id)
//   7. Si Stripe échoue → credit_wallet_on_withdrawal_failure_akasha (reversal)
//   8. Insert connect_withdrawals status=pending
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import crypto from 'crypto';
import {
  fingerprintValue,
  checkFingerprintUniqueness,
  computeTrustTier,
  buildCollusionClusters,
  scoreCluster,
} from '@purama/antifraud';
import type { AccountSignal } from '@purama/antifraud';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createPublicServiceClient } from '@/lib/supabase-public';
import { getConnectAccountRow, getStripe } from '@/lib/stripe/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  amount_eur: z
    .number()
    .positive('Le montant doit être positif')
    .max(100_000, 'Montant maximum par retrait : 100 000€')
    .optional(),
  idempotency_key: z.string().regex(uuidRegex, 'Clé invalide'),
});

const MIN_WITHDRAWAL_EUR = 20;

export async function POST(req: NextRequest) {
  try {
    // 1. Auth first
    const authClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // 2. Parse body (optionnel)
    let parsedBody: Partial<z.infer<typeof bodySchema>> = {};
    try {
      const raw = await req.text();
      if (raw.trim().length > 0) {
        const json: unknown = JSON.parse(raw);
        parsedBody = bodySchema.parse(json);
      }
    } catch (e) {
      if (e instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Données invalides', details: e.issues },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
    }

    if (!parsedBody.idempotency_key) {
      return NextResponse.json({ error: 'Clé idempotency_key manquante' }, { status: 400 });
    }

    const publicService = createPublicServiceClient();

    // 3. Wallet balance via RPC (akasha_ai schema non-exposé via REST direct)
    const { data: balanceData, error: balanceErr } = await publicService.rpc(
      'get_wallet_balance_akasha',
      { p_user_id: user.id },
    );

    if (balanceErr) {
      return NextResponse.json(
        { error: `Lecture du solde impossible : ${balanceErr.message}` },
        { status: 500 },
      );
    }

    const walletBalance = Number(balanceData ?? 0);

    // 4. Montant final + MIN check
    const requestedAmount = parsedBody.amount_eur ?? walletBalance;
    const amountEur = Math.round(requestedAmount * 100) / 100;

    if (amountEur < MIN_WITHDRAWAL_EUR) {
      return NextResponse.json(
        {
          error: `Montant minimum ${MIN_WITHDRAWAL_EUR}€ pour un retrait.`,
          code: 'below_minimum',
          min_eur: MIN_WITHDRAWAL_EUR,
          current_balance_eur: walletBalance,
        },
        { status: 400 },
      );
    }

    if (amountEur > walletBalance) {
      return NextResponse.json(
        {
          error: 'Solde insuffisant',
          code: 'insufficient_balance',
          requested_eur: amountEur,
          current_balance_eur: walletBalance,
        },
        { status: 400 },
      );
    }

    // 5. Vérif compte Connect prêt
    const connectAccount = await getConnectAccountRow(publicService, user.id);
    if (!connectAccount) {
      return NextResponse.json(
        {
          error: 'Compte Stripe Connect non créé. Commence par /compte/connect.',
          code: 'no_connect_account',
        },
        { status: 403 },
      );
    }

    if (!connectAccount.payouts_enabled) {
      return NextResponse.json(
        {
          error:
            "Ton compte n'est pas encore prêt pour les retraits. Termine la vérification sur /compte/connect.",
          code: 'payouts_disabled',
          stripe_account_id: connectAccount.stripe_account_id,
        },
        { status: 403 },
      );
    }

    // 5b. Anti-fraud checks — trust tier + collusion + withdrawal cap
    const { data: profile } = await publicService
      .from('profiles')
      .select('phone_verified, kyc_status, device_id')
      .eq('id', user.id)
      .single();

    const phoneVerified = profile?.phone_verified ?? false;
    const dbKycStatus = (profile?.kyc_status ?? 'unverified') as
      | 'unverified'
      | 'pending'
      | 'verified'
      | 'rejected';
    // Map DB kyc_status ('unverified') to antifraud KycStatus ('not_started')
    const kycStatus: 'not_started' | 'pending' | 'verified' | 'rejected' =
      dbKycStatus === 'unverified' ? 'not_started' : dbKycStatus;
    const deviceId = profile?.device_id;

    // Construire signaux collusion à partir des données disponibles
    // Fenêtre glissante 90 jours recommandée (pas implémentée ici — tous les signaux historiques)
    const signals: AccountSignal[] = [];

    // Signal IBAN fingerprint depuis connect_withdrawals existants (critique)
    const { data: existingWithdrawals } = await publicService
      .from('connect_withdrawals')
      .select('user_id, fraud_metadata')
      .neq('user_id', user.id)
      .not('fraud_metadata->iban_fingerprint', 'is', null);

    if (existingWithdrawals && existingWithdrawals.length > 0) {
      for (const w of existingWithdrawals) {
        const fp = (w.fraud_metadata as { iban_fingerprint?: string })?.iban_fingerprint;
        if (fp) {
          signals.push({
            accountId: w.user_id,
            type: 'iban_fingerprint',
            fingerprint: fp,
          });
        }
      }
    }

    // Signal device_id (medium severity per collusion.ts SIGNAL_SEVERITY)
    if (deviceId) {
      const { data: sameDeviceUsers } = await publicService
        .from('profiles')
        .select('id, device_id')
        .eq('device_id', deviceId)
        .neq('id', user.id);

      if (sameDeviceUsers && sameDeviceUsers.length > 0) {
        for (const u of sameDeviceUsers) {
          signals.push({
            accountId: u.id,
            type: 'device_fingerprint',
            fingerprint: deviceId,
          });
        }
      }
    }

    // Analyser collusion
    let hasActiveCollusionFlag = false;
    if (signals.length > 0) {
      const clusters = buildCollusionClusters(signals);
      const userCluster = clusters.find((c) => c.accountIds.includes(user.id));

      if (userCluster) {
        const clusterScore = scoreCluster(userCluster);
        if (clusterScore.shouldFreeze) {
          hasActiveCollusionFlag = true;
          // Geler immédiatement — ne PAS continuer le retrait
          await publicService
            .from('profiles')
            .update({ metadata: { collusion_flag: true, cluster_info: clusterScore } })
            .eq('id', user.id);

          return NextResponse.json(
            {
              error:
                `Activité suspecte détectée (signaux partagés avec d'autres comptes). Ton compte est gelé et en attente de revue humaine. Contacte le support.`,
              code: 'fraud_frozen',
            },
            { status: 403 },
          );
        }
      }
    }

    // Calculer le palier de confiance
    const trustTier = computeTrustTier({
      phoneVerificationStatus: phoneVerified ? 'verified' : 'unverified',
      kycStatus,
      ibanUnique: null, // Pas encore implémenté — IBAN fingerprint capture nécessite webhook Connect
      livenessVerified: false, // Pas de provider Onfido configuré pour akasha-ai
      hasActiveCollusionFlag,
    });

    // Appliquer le plafond de retrait/jour — pour cette implémentation simplifiée,
    // on vérifie juste contre le cap absolu (pas de fenêtre glissante quotidienne)
    if (
      trustTier.withdrawalCapEuros !== null &&
      amountEur > trustTier.withdrawalCapEuros
    ) {
      return NextResponse.json(
        {
          error: `Montant supérieur à ta limite actuelle (${trustTier.withdrawalCapEuros}€). ${trustTier.nextTierRequirements.join(' ') || 'Vérifie ton identité pour augmenter ta limite.'}`,
          code: 'withdrawal_cap_exceeded',
          max_allowed_eur: trustTier.withdrawalCapEuros,
          current_tier: trustTier.tier,
          next_tier_requirements: trustTier.nextTierRequirements,
        },
        { status: 403 },
      );
    }

    // Premier retrait — gate KYC vérifié comme proxy pour liveness
    // (pas de provider Onfido réel configuré pour akasha-ai, donc on use KYC status)
    const { data: previousWithdrawals, count: withdrawalCount } = await publicService
      .from('connect_withdrawals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed');

    const isFirstWithdrawal = (withdrawalCount ?? 0) === 0;

    if (isFirstWithdrawal && kycStatus !== 'verified') {
      return NextResponse.json(
        {
          error:
            'Premier retrait : vérification KYC requise. Termine ton onboarding Stripe Connect pour débloquer les retraits.',
          code: 'first_withdrawal_kyc_required',
        },
        { status: 403 },
      );
    }

    // 6. Débit wallet atomique
    const { data: debitData, error: debitErr } = await publicService.rpc(
      'debit_wallet_for_withdrawal_akasha',
      { p_user_id: user.id, p_amount: amountEur },
    );

    if (debitErr) {
      const msg = debitErr.message || 'Erreur débit';
      if (msg.includes('insufficient_balance')) {
        return NextResponse.json(
          {
            error: 'Solde insuffisant (concurrence détectée)',
            code: 'insufficient_balance',
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: msg, code: 'debit_failed' }, { status: 500 });
    }

    const newBalance =
      typeof debitData === 'number' ? debitData : walletBalance - amountEur;

    // 7. Stripe Transfer (reversal si échec)
    const stripe = getStripe();
    let transferId: string | null = null;
    let stripeError: string | null = null;

    try {
      const transfer: Stripe.Transfer = await stripe.transfers.create({
        amount: Math.round(amountEur * 100),
        currency: 'eur',
        destination: connectAccount.stripe_account_id,
        description: `Retrait wallet AKASHA user ${user.id}`,
        metadata: {
          user_id: user.id,
          app: 'akasha_ai',
          source: 'connect_withdraw',
        },
      }, { idempotencyKey: parsedBody.idempotency_key });
      transferId = transfer.id;
    } catch (e) {
      stripeError = e instanceof Error ? e.message : 'Stripe transfer failed';
    }

    // 8. Log row (toujours — pending ou failed) w/ fraud metadata
    const status = stripeError ? 'failed' : 'pending';
    const fraudMetadata = {
      trust_tier: trustTier.tier,
      withdrawal_cap_eur: trustTier.withdrawalCapEuros,
      is_first_withdrawal: isFirstWithdrawal,
      device_id: deviceId ?? null,
      // IBAN fingerprint serait stocké ici si l'IBAN était capturé dans ce flux.
      // Pour Stripe Connect, l'IBAN est sur le compte Connect lui-même, pas ici.
      // À implémenter : hook Connect account.updated webhook pour capturer IBAN fp.
    };

    await publicService.from('connect_withdrawals').insert({
      user_id: user.id,
      stripe_account_id: connectAccount.stripe_account_id,
      stripe_transfer_id: transferId,
      amount_eur: amountEur,
      status,
      error: stripeError,
      fraud_status: 'approved',
      fraud_metadata: fraudMetadata,
    });

    if (stripeError) {
      await publicService.rpc('credit_wallet_on_withdrawal_failure_akasha', {
        p_user_id: user.id,
        p_amount: amountEur,
      });
      return NextResponse.json(
        {
          error: `Transfert Stripe échoué : ${stripeError}. Ton solde a été restauré.`,
          code: 'stripe_transfer_failed',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      transfer_id: transferId,
      amount_eur: amountEur,
      new_balance_eur: newBalance,
      status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur interne lors du retrait';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}

export function PUT() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}

export function DELETE() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}
