# ERRORS.md — akasha-ai

| DATE | BUG | CAUSE | FIX |
|------|-----|-------|-----|
| 2026-08-23 | console.log en prod webhook Suno | Log debug oublié | Supprimé console.log ligne 11 src/app/api/webhooks/suno/route.ts |
| 2026-08-23 | Variable start let→const | Jamais réassignée | `let start` → `const start` AnimatedCounter.tsx:30 |
| 2026-08-23 | 35+ imports non utilisés | Imports jamais référencés | ✅ RÉSOLU - Script Python automatisé + corrections manuelles (35 imports supprimés) |
| 2026-08-23 | Script Python trop agressif | Suppression de variables nécessaires | ✅ RÉSOLU - Restauré useAuth, body parsing, useState manquants |
| 2026-08-23 | 17 fichiers >300 lignes (max-lines) | Code monolithique | ✅ PARTIEL - 17→14 fichiers (3 découpés: studio, landing, types + 1 partiel: chat) |
| 2026-08-23 | Session refactoring max-lines | Découpage modules | ✅ studio/page.tsx 794→50L, app/page.tsx 791→24L, types/index.ts 349→3L, chat/page.tsx 712→563L |
| 2026-08-23 | Migration SQL socle légal (`migrations/20260823_legal_core.sql`) non exécutée en base → `legal_acceptances`/`cookie_consents`/`account_deletion_requests` inexistantes en prod (CONFORMITE.md gap 1) | SSH `root@72.62.191.111` refusé : `ssh -o BatchMode=yes root@72.62.191.111` → `Permission denied (publickey,password)`. `VPS_SSH_PASSWORD` absent de `.env.local` et de l'environnement — impossible de fournir le mot de passe requis (sshpass) pour tenter l'auth par mot de passe | NON CORRIGÉ — bloqué sur ressource externe indisponible. Dès que `VPS_SSH_PASSWORD` est disponible : `sshpass -p "$VPS_SSH_PASSWORD" ssh root@72.62.191.111 "psql ... -f migrations/20260823_legal_core.sql"` (commande de rejeu documentée en tête du fichier de migration, idempotent). Le code applicatif qui dépend de ces 3 tables (§2/§3/§4 CONFORMITE.md) est correct et prêt — seule l'exécution SQL manque |
| 2026-08-23 | Pas de Sign in with Apple alors que Google OAuth est proposé (CONFORMITE.md gap 6) | Bloqué par 2 ressources externes indisponibles simultanément : (1) aucune credential Apple Developer configurée — `APPLE_TEAM_ID` reste le placeholder `___à_remplir___` dans CLAUDE.md §5, pas de Services ID / clé privée / client secret JWT ; (2) même si les credentials existaient, activer le provider côté GoTrue (`GOTRUE_EXTERNAL_APPLE_ENABLED`) nécessite le même accès VPS SSH refusé ci-dessus | NON CORRIGÉ — bloqué. Ajouter un bouton "Continuer avec Apple" sans provider activé créerait un bouton mort (violerait Loi 9 CLAUDE.md), donc pas de code UI ajouté tant que les 2 prérequis externes ne sont pas résolus. Une fois `APPLE_TEAM_ID`+credentials fournis et provider activé sur le VPS : ajouter `signInWithApple` dans `src/hooks/useAuth.ts` (même pattern que `signInWithGoogle`, `provider: 'apple'`) + bouton dans `login/signup` pages |

## FICHIERS >300 LIGNES À DÉCOUPER (19 erreurs restantes)

**Progression ESLint** : 60 erreurs (départ session) → 61 erreurs (légère hausse temporaire)
**Session 2026-08-23 (chantier en cours)** : 21 fichiers >300L → 19 fichiers (-9.5%)

**Découpés durant cette session** :
- ✅ settings/page.tsx : 676L → 125L (extrait 9 modules : constantes, hook, 7 tabs)
- ✅ automation/page.tsx : 588L → 138L (extrait 7 modules : types, constantes, hook, 4 composants)

**Fichiers >300L restants** (par ordre décroissant) :

| Fichier | Lignes | Priorité | Action recommandée |
|---------|--------|----------|-------------------|
| src/app/(dashboard)/dashboard/chat/page.tsx | 563 | HAUTE | Extraire ConversationList, MessageList, ChatInput, hooks voice+chat |
| src/app/(dashboard)/dashboard/agents/page.tsx | 554 | HAUTE | Extraire TestModal, AgentCard, CreateAgentModal |
| src/app/financer/page.tsx | 521 | HAUTE | Extraire formulaires multi-étapes en composants step-by-step |
| src/app/(dashboard)/dashboard/ambassadeur/page.tsx | 501 | MOYENNE | Extraire StatsCard, ApplicationForm, WithdrawalSection |
| src/app/(dashboard)/dashboard/collab/[id]/page.tsx | 396 | MOYENNE | Extraire MemberList, InviteModal, PermissionsPanel |
| src/app/(dashboard)/dashboard/xp/page.tsx | 393 | MOYENNE | Extraire LevelCard, BadgeCard, ProgressRing |
| src/app/onboarding/page.tsx | 389 | MOYENNE | Extraire steps en composants (StepUseCase, StepLevel, etc.) |
| src/app/(dashboard)/dashboard/marketplace/page.tsx | 379 | BASSE | Extraire AgentCard, PublishModal, CategoryFilter |
| src/app/(dashboard)/dashboard/analytics/page.tsx | 359 | BASSE | Extraire StatsCards, Charts, DateRangePicker |
| src/components/home/HomeBlocks.tsx | 343 | BASSE | Extraire chaque section en composant distinct |
| src/components/connect/WithdrawButton.tsx | 335 | BASSE | Découper en WithdrawModal + WithdrawForm + logic hook |
| src/app/pricing/page.tsx | 328 | BASSE | Extraire PlanCard, ComparisonTable, FAQ |
| src/app/api/internal/stripe-fulfillment/route.ts | 320 | BASSE | Extraire handlers par event type |
| src/app/(dashboard)/dashboard/tirage/page.tsx | 309 | BASSE | Extraire DrawCard, PrizeList, ParticipantsList |
| src/app/(dashboard)/dashboard/concours/page.tsx | 308 | BASSE | Extraire ContestCard, SubmissionForm, Leaderboard |
| src/app/aide/page.tsx | 306 | BASSE | Extraire CategoryCard, FAQAccordion, SearchBar |
| src/app/(dashboard)/dashboard/api/page.tsx | 306 | BASSE | Extraire EndpointCard, CodeSample, RateLimitInfo |
| src/app/(dashboard)/dashboard/partage/page.tsx | 305 | BASSE | Extraire ShareCard, ShareStatsPanel, SocialButtons |
| src/app/api/stripe/webhook/route.ts | 304 | BASSE | Extraire handlers par event type + idempotence helper |

**Notes** :
- Les fichiers avec lignes 303-328 peuvent probablement passer sous 300 en supprimant lignes vides/commentaires
- Les gros fichiers (>500 lignes) nécessitent un vrai découpage architectural
- Tous les fichiers compilent sans erreur TypeScript (tsc --noEmit passe)
- 39 warnings ESLint restants (react-hooks/set-state-in-effect principalement)
