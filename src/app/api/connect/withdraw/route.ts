// =============================================================================
// AKASHA AI — POST /api/connect/withdraw (V4.1 Axe 3)
//
// Retire le solde wallet vers le compte Stripe Connect de l'user authentifié.
// Seuil min 20€ (brief STRIPE_CONNECT_KARMA_V4.md §Grille frais).
//
// Admission, débit et clé sont persistés ensemble ; le droit d'envoi est consommé une fois.
// Un résultat fournisseur inconnu impose un rapprochement, sans nouveau transfert ni recrédit.
// Le reçu partagé et la conclusion du journal sont confirmés dans une transaction.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  computeTrustTier,
  buildCollusionClusters,
  scoreCluster,
} from '@purama/antifraud';
import type { AccountSignal } from '@purama/antifraud';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createPublicServiceClient } from '@/lib/supabase-public';
import { getConnectAccountRow, getStripe } from '@/lib/stripe/connect';
import { bodySchema } from './request-schema';
import { configuredStripeWebhookMode } from '@/lib/stripe/webhook-mode';
import { WithdrawalFailure, activeWithdrawalResult, cancelWithdrawal, readActiveWithdrawal, readWithdrawal, withdrawalResult, withdrawalRpc, type WithdrawalIdentity } from '@/lib/stripe/withdrawal-contract';
import { admitWithdrawal, resumeWithdrawal } from '@/lib/stripe/withdrawal-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_WITHDRAWAL_EUR = 20;

export async function POST(req: NextRequest) {
  let requestKey: string | undefined;
  try {
    // 1. Auth first
    const authClient = await createServerSupabaseClient();
    const {
      data: { user }, error: authError,
    } = await authClient.auth.getUser();

    if (!user || authError) {
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

    requestKey = parsedBody.idempotency_key;
    if (!parsedBody.idempotency_key) {
      return NextResponse.json({ error: 'Clé idempotency_key manquante' }, { status: 400 });
    }

    if (parsedBody.owner_id && parsedBody.owner_id !== user.id) {
      return NextResponse.json({ error: 'La connexion a changé. Reviens à ton compte pour vérifier la demande.',
        code: 'withdrawal_identity_changed' }, { status: 409 });
    }
    const mode = configuredStripeWebhookMode();
    if (!mode) return NextResponse.json({ error: 'Service de retrait indisponible.',
      code: 'withdrawal_configuration_unavailable' }, { status: 503 });
    // Configuration is established before any balance mutation.
    const publicService = createPublicServiceClient();
    const identity: WithdrawalIdentity = { userId: user.id,
      requestKey: parsedBody.idempotency_key,
      requestedAmount: parsedBody.amount_eur === undefined ? null : Math.round(parsedBody.amount_eur * 100) / 100,
      mode };
    if (parsedBody.action === 'cancel') {
      const result = await cancelWithdrawal(publicService, identity);
      return NextResponse.json(result.body, { status: result.status });
    }
    const stripe = getStripe();
    const dependencies = { db: publicService,
      createTransfer: stripe.transfers.create.bind(stripe.transfers) };
    // A replay is read before checking a balance which may already have been debited.
    const previous = await readWithdrawal(publicService, identity);
    if (previous && previous.state !== 'reserved') {
      const result = await resumeWithdrawal(dependencies, identity, previous);
      return NextResponse.json(result.body, { status: result.status });
    }

    const active = previous ? null : await readActiveWithdrawal(publicService, user.id, mode);
    if (active) {
      const result = activeWithdrawalResult(active, identity.requestKey);
      return NextResponse.json(result.body, { status: result.status });
    }

    const preflightFailure = async (body: Record<string, unknown>, options: { status: number }) => {
      // Another request with this key may have completed after our initial read.
      const latest = await readWithdrawal(publicService, identity);
      if (latest && latest.state !== 'reserved') {
        const result = withdrawalResult(latest, true);
        return NextResponse.json(result.body, { status: result.status });
      }
      const activeNow = latest ? null : await readActiveWithdrawal(publicService, user.id, mode);
      if (activeNow) {
        const result = activeWithdrawalResult(activeNow, identity.requestKey);
        return NextResponse.json(result.body, { status: result.status });
      }
      // A preflight observation is not a persisted cancellation of this key.
      return NextResponse.json({ ...body, ok: false, request_key: identity.requestKey,
        retry_same_request: true,
        ...(latest ? { operation_state: latest.state, request_id: latest.request_id,
          amount_eur: latest.amount_eur } : {}) }, options);
    };

    // 3. Wallet balance via RPC (akasha_ai schema non-exposé via REST direct)
    const balanceData = previous ? previous.amount_eur + previous.new_balance_eur
      : await withdrawalRpc(publicService, 'get_wallet_balance_akasha', { p_user_id: user.id });

    const walletBalance = Number(balanceData);
    if (balanceData === null || !Number.isFinite(walletBalance) || walletBalance < 0
        || !Number.isSafeInteger(Math.round(walletBalance * 100))) {
      throw new WithdrawalFailure('withdrawal_balance_unconfirmed');
    }

    // 4. Montant final + MIN check
    const requestedAmount = previous?.amount_eur ?? parsedBody.amount_eur ?? walletBalance;
    const amountEur = Math.round(requestedAmount * 100) / 100;

    if (amountEur < MIN_WITHDRAWAL_EUR) {
      return preflightFailure(
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
      return preflightFailure(
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
      return preflightFailure(
        {
          error: 'Compte Stripe Connect non créé. Commence par /compte/connect.',
          code: 'no_connect_account',
        },
        { status: 403 },
      );
    }

    if (previous && previous.destination !== connectAccount.stripe_account_id) {
      throw new WithdrawalFailure('withdrawal_request_conflict', 409);
    }
    if (!connectAccount.payouts_enabled) {
      return preflightFailure(
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
    const { data: profile, error: profileError } = await publicService
      .from('profiles')
      .select('phone_verified, kyc_status, device_id, metadata')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new WithdrawalFailure('withdrawal_eligibility_unconfirmed');

    if (profile.metadata && typeof profile.metadata === 'object'
        && !Array.isArray(profile.metadata) && profile.metadata.collusion_flag === true) {
      return preflightFailure({ error: 'Ce compte est gelé et attend une revue. Aucun transfert ne sera envoyé.',
        code: 'fraud_frozen' }, { status: 403 });
    }
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
    const { data: existingWithdrawals, error: historyError } = await publicService
      .from('connect_withdrawals')
      .select('user_id, metadata')
      .neq('user_id', user.id)
      .not('metadata->fraud->iban_fingerprint', 'is', null);

    if (historyError || !Array.isArray(existingWithdrawals)) throw new WithdrawalFailure('withdrawal_history_unconfirmed');

    for (const w of existingWithdrawals) {
      const fp = (w.metadata as { fraud?: { iban_fingerprint?: string } })?.fraud?.iban_fingerprint;
      if (fp) {
        signals.push({
          accountId: w.user_id,
          type: 'iban_fingerprint',
          fingerprint: fp,
        });
      }
    }

    // Signal device_id (medium severity per collusion.ts SIGNAL_SEVERITY)
    if (deviceId) {
      const { data: sameDeviceUsers, error: deviceError } = await publicService
        .from('profiles')
        .select('id, device_id')
        .eq('device_id', deviceId)
        .neq('id', user.id);

      if (deviceError || !Array.isArray(sameDeviceUsers)) throw new WithdrawalFailure('withdrawal_eligibility_unconfirmed');
      if (sameDeviceUsers && sameDeviceUsers.length > 0) {
        signals.push({ accountId: user.id, type: 'device_fingerprint', fingerprint: deviceId });
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
          const metadata = profile.metadata && typeof profile.metadata === 'object' && !Array.isArray(profile.metadata)
            ? profile.metadata : {};
          const frozen = await publicService.from('profiles')
            .update({ metadata: { ...metadata, collusion_flag: true, cluster_info: clusterScore } })
            .eq('id', user.id).select('id').single();
          if (frozen.error || frozen.data?.id !== user.id) throw new WithdrawalFailure('withdrawal_freeze_unconfirmed');

          return preflightFailure(
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

    // The transaction also enforces this existing cap against confirmed UTC-day history.
    if (
      trustTier.withdrawalCapEuros !== null &&
      amountEur > trustTier.withdrawalCapEuros
    ) {
      return preflightFailure(
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
    const { count: withdrawalCount, error: countError } = await publicService
      .from('connect_withdrawals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'paid');
    if (countError || !Number.isSafeInteger(withdrawalCount) || withdrawalCount === null || withdrawalCount < 0) {
      throw new WithdrawalFailure('withdrawal_history_unconfirmed');
    }

    const isFirstWithdrawal = (withdrawalCount ?? 0) === 0;

    if (isFirstWithdrawal && kycStatus !== 'verified') {
      return preflightFailure(
        {
          error:
            'Premier retrait : vérification KYC requise. Termine ton onboarding Stripe Connect pour débloquer les retraits.',
          code: 'first_withdrawal_kyc_required',
        },
        { status: 403 },
      );
    }

    if (previous) {
      const result = await resumeWithdrawal(dependencies, identity, previous);
      return NextResponse.json(result.body, { status: result.status });
    }
    const result = await admitWithdrawal(dependencies, {
      ...identity, amount: amountEur, destination: connectAccount.stripe_account_id,
      dailyCap: trustTier.withdrawalCapEuros,
      fraudMetadata: { trust_tier: trustTier.tier,
        withdrawal_cap_eur: trustTier.withdrawalCapEuros,
        is_first_withdrawal: isFirstWithdrawal, device_id: deviceId ?? null },
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof WithdrawalFailure) return NextResponse.json({ ok: false,
      error: error.message, code: error.code, request_key: requestKey,
      retry_same_request: true
    }, { status: error.status });
    const message =
      error instanceof Error ? error.message : 'Erreur interne lors du retrait';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 });
}

export const PUT = GET;
export const DELETE = GET;
