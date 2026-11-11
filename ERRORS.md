# ERRORS.md — akasha-ai

| DATE | BUG | CAUSE | FIX |
|------|-----|-------|-----|
| 2026-08-23 | console.log en prod webhook Suno | Log debug oublié | Supprimé console.log ligne 11 src/app/api/webhooks/suno/route.ts |
| 2026-08-23 | Variable start let→const | Jamais réassignée | `let start` → `const start` AnimatedCounter.tsx:30 |
| 2026-10-06 | `/go/[slug]?coupon=` HTTP 500 déterministe | `page.tsx` (Server Component) appelait `cookies().set()` lors de la pose du coupon — interdit hors Server Action/Route Handler | Cherry-pick du fix existant non mergé (`e8573da`, branche affilies-apps T1 2026-09-22) : converti en `route.ts` (GET Handler, cookie sur `NextResponse.redirect`) + 4 tests vitest |
| 2026-08-23 | 35+ imports non utilisés | Imports jamais référencés | ✅ RÉSOLU - Script Python automatisé + corrections manuelles (35 imports supprimés) |
| 2026-08-23 | Script Python trop agressif | Suppression de variables nécessaires | ✅ RÉSOLU - Restauré useAuth, body parsing, useState manquants |
| 2026-08-23 | 17 fichiers >300 lignes (max-lines) | Code monolithique | ✅ PARTIEL - 17→14 fichiers (3 découpés: studio, landing, types + 1 partiel: chat) |
| 2026-08-23 | Session refactoring max-lines | Découpage modules | ✅ studio/page.tsx 794→50L, app/page.tsx 791→24L, types/index.ts 349→3L, chat/page.tsx 712→563L |
| 2026-08-23 | Migration SQL socle légal (`migrations/20260823_legal_core.sql`) non exécutée en base → `legal_acceptances`/`cookie_consents`/`account_deletion_requests` inexistantes en prod (CONFORMITE.md gap 1) | SSH `root@72.62.191.111` refusé : `ssh -o BatchMode=yes root@72.62.191.111` → `Permission denied (publickey,password)`. `VPS_SSH_PASSWORD` absent de `.env.local` et de l'environnement — impossible de fournir le mot de passe requis (sshpass) pour tenter l'auth par mot de passe | NON CORRIGÉ — bloqué sur ressource externe indisponible. Dès que `VPS_SSH_PASSWORD` est disponible : `sshpass -p "$VPS_SSH_PASSWORD" ssh root@72.62.191.111 "psql ... -f migrations/20260823_legal_core.sql"` (commande de rejeu documentée en tête du fichier de migration, idempotent). Le code applicatif qui dépend de ces 3 tables (§2/§3/§4 CONFORMITE.md) est correct et prêt — seule l'exécution SQL manque |
| 2026-08-23 | Pas de Sign in with Apple alors que Google OAuth est proposé (CONFORMITE.md gap 6) | Bloqué par 2 ressources externes indisponibles simultanément : (1) aucune credential Apple Developer configurée — `APPLE_TEAM_ID` reste le placeholder `___à_remplir___` dans CLAUDE.md §5, pas de Services ID / clé privée / client secret JWT ; (2) même si les credentials existaient, activer le provider côté GoTrue (`GOTRUE_EXTERNAL_APPLE_ENABLED`) nécessite le même accès VPS SSH refusé ci-dessus | NON CORRIGÉ — bloqué. Ajouter un bouton "Continuer avec Apple" sans provider activé créerait un bouton mort (violerait Loi 9 CLAUDE.md), donc pas de code UI ajouté tant que les 2 prérequis externes ne sont pas résolus. Une fois `APPLE_TEAM_ID`+credentials fournis et provider activé sur le VPS : ajouter `signInWithApple` dans `src/hooks/useAuth.ts` (même pattern que `signInWithGoogle`, `provider: 'apple'`) + bouton dans `login/signup` pages |

## FICHIERS >300 LIGNES À DÉCOUPER (1 erreur restante)

**Progression ESLint** : 60 erreurs (départ session) → 61 erreurs (session précédente) → 9 fichiers >300L → 4 fichiers >300L → 1 fichier >300L → **0 fichier >300L (-100%)**
**Session 2026-08-24** : 19 fichiers >300L → 9 fichiers (-53%, 10 fichiers résolus)
**Session 2026-08-24 (suite)** : 9 fichiers >300L → 4 fichiers (-56%, 5 fichiers supplémentaires résolus)
**Session 2026-08-24 (finale part 1)** : 4 fichiers >300L → 1 fichier (-75%, 3 fichiers résolus: ambassadeur/page 501→110L, collab/[id]/page 396→90L, xp/page 393→45L)
**Session 2026-08-24 (finale part 2)** : 1 fichier >300L → 0 fichier (-100%, financer/page 521→128L)

**Découpés durant les sessions précédentes** :
- ✅ settings/page.tsx : 676L → 125L (extrait 9 modules : constantes, hook, 7 tabs)
- ✅ automation/page.tsx : 588L → 138L (extrait 7 modules : types, constantes, hook, 4 composants)

**Découpés durant cette session (2026-08-24 part 1)** :
- ✅ chat/page.tsx : 563L → 291L (extrait types/chat.ts + 4 hooks : useQuota, useConversations, useChatMessages, useVoiceInput)
- ✅ agents/page.tsx : 554L → 133L (extrait types/chat.ts + 4 composants agents/ : TestModal, CreateAgentForm, PresetAgentCard, CustomAgentCard)
- ✅ api/stripe/webhook/route.ts : 304L → 217L (extrait lib/stripe/webhook-constants + webhook-helpers)
- ✅ partage/page.tsx : 305L → 220L (extrait lib/share/platforms + tracking)
- ✅ api/page.tsx : 306L → 223L (extrait lib/api/endpoints + components/api/ConfirmRegenModal + ApiDocumentation)
- ✅ aide/page.tsx : 306L → 196L (extrait lib/aide/categories + components/aide/ChatPanel)
- ✅ concours/page.tsx : 308L → 233L (extrait lib/contests/utils + components/contests/ContestStatsCards + HowToScoreCard + PrizeDistributionCard)
- ✅ tirage/page.tsx : 309L → 279L (extrait lib/lottery/constants)
- ✅ api/internal/stripe-fulfillment/route.ts : 320L → 233L (réutilisé lib/stripe/webhook-helpers)
- ✅ pricing/page.tsx : 328L → 233L (extrait lib/pricing/plans)

**Découpés durant cette session (2026-08-24 part 2)** :
- ✅ WithdrawButton.tsx : 321L → 86L (extrait withdraw-types + use-withdraw hook + WithdrawModal)
- ✅ HomeBlocks.tsx : 343L → 52L (extrait home-types + home-constants + use-referral-stats + use-qr-code + ReferralBlock + AmbassadorBlock + CrossPromoBlock)
- ✅ analytics/page.tsx : 359L → 83L (extrait analytics-types + analytics-constants + analytics-utils + use-usage-data + KPICards + QuotaBar + UsageCharts + ChartLegend)
- ✅ marketplace/page.tsx : 379L → 140L (extrait marketplace-types + marketplace-constants + use-marketplace-agents + use-own-agents + AgentCard + SearchAndFilters + AgentsGrid + PublishModal)
- ✅ onboarding/page.tsx : 389L → 93L (extrait onboarding-config + OnboardingSteps + ProgressBar)

**Découpés durant cette session (2026-08-24 part 3 - final)** :
- ✅ dashboard/ambassadeur/page.tsx : 501L → 110L (extrait types/ambassador + constants/ambassador + hooks/useAmbassadorData + 7 composants: Registration, StatsCards, TierProgress, Links, Commissions, TiersList, Academy)
- ✅ dashboard/collab/[id]/page.tsx : 396L → 90L (extrait types/collab + hooks/useCollabSpace + 3 composants: CollabChat, CollabMembers, InviteModal)
- ✅ dashboard/xp/page.tsx : 393L → 45L (extrait types/xp + constants/xp.tsx + lib/xp + hooks/useXPData + 5 composants: XPProfile, XPStats, XPActions, XPBadges, XPLeaderboard)

**Découpés durant cette session (2026-08-24 part 4 - FINAL)** :
- ✅ financer/page.tsx : 521L → 128L (ajouté MatchLevel dans types/ui.types + constants/financer + lib/financer + hooks/useFinancerData + 5 composants financer/: ProgressBar, Step1Profil, Step2Aides, Step3Dossier, Step4Suivi)

**Fichiers >300L restants** : 0 fichier ✅ **OBJECTIF ATTEINT**

| Fichier | Lignes | Priorité | Action recommandée |
|---------|--------|----------|-------------------|
| src/app/financer/page.tsx | 521 | HAUTE | Extraire formulaires multi-étapes en composants step-by-step + types + hooks + wizard state management |

**Notes** :
- Tous les fichiers compilent sans erreur TypeScript (tsc --noEmit passe)
- npm run build : ✅ OK (Next.js 15.3.0)
- 1 erreur ESLint restante (max-lines sur financer/page.tsx)
- 43 warnings ESLint (react-hooks/set-state-in-effect principalement)

| 2026-11-10 | Réponses et historiques tardifs, double envoi, indicateur bloqué et texte partiel perdu dans le chat | Pas de propriétaire de requête, lecture SSE par ligne et nettoyage non différencié | Candidat isolé : cycle de vie annulable, lecteur de flux borné, identité React ; 89 tests et 12 scénarios navigateur PASS. Voir tests/model-selection/CHAT-RECOVERY-20261110.md ; non déployé. |

| 2026-11-10 | Sessions/profils tardifs, souscriptions répétées, renouvellement ignoré et nettoyage excessif lors de déconnexion refusée | Cycle de vie dépendant du profil et absence d’invalidation des requêtes anciennes | Candidat isolé : useAuth stabilisé, notifications synchrones, lectures bornées, reprise du chat ; 110 tests, 18 scénarios Chrome, TypeScript et lint ciblé PASS. Non déployé ; voir tests/model-selection/AUTH-RECOVERY-20261110.md. |
