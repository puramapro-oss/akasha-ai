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

## FICHIERS >300 LIGNES À DÉCOUPER (14 erreurs restantes)

**Progression ESLint** : 52 erreurs → 17 erreurs (session précédente, 63% réduction)  
**Session 2026-08-23** : 17 erreurs max-lines → 14 erreurs (-17.6% erreurs max-lines)

Liste des fichiers dépassant la limite de 300 lignes (règle max-lines @purama/eslint-config) :

| Fichier | Lignes | Priorité | Action recommandée |
|---------|--------|----------|-------------------|
| ✅ src/app/page.tsx | ~~732~~ 24 | FAIT | Découpé en Nav, LandingHero, ProductSections, BottomSections |
| ✅ src/app/(dashboard)/dashboard/studio/page.tsx | ~~730~~ 50 | FAIT | Découpé en ImageTab, VideoTab, AudioTab, CodeTab, StudioUtils |
| src/app/(dashboard)/dashboard/settings/page.tsx | 676 | HAUTE | Découper par sections (Profile, Preferences, Security, etc.) |
| ✅ src/app/(dashboard)/dashboard/chat/page.tsx | ~~625~~ 563 | PARTIEL | Extrait ModelSelector, MessageBubble, ConvItem → ChatUtils (reste 563L) |
| src/app/(dashboard)/dashboard/automation/page.tsx | 588 | MOYENNE | Extraire WorkflowCard, ExecutionLog, TriggerConfig |
| src/app/(dashboard)/dashboard/agents/page.tsx | 554 | MOYENNE | Extraire TestModal, AgentCard en fichiers séparés |
| src/app/financer/page.tsx | 521 | MOYENNE | Extraire formulaires multi-étapes en composants |
| src/app/(dashboard)/dashboard/ambassadeur/page.tsx | 501 | MOYENNE | Extraire StatsCard, ApplicationForm |
| src/app/(dashboard)/dashboard/collab/[id]/page.tsx | 396 | BASSE | Extraire MemberList, InviteModal |
| src/app/(dashboard)/dashboard/xp/page.tsx | 395 | BASSE | Supprimer lignes vides, extraire 1-2 petits composants |
| src/app/onboarding/page.tsx | 389 | BASSE | Extraire steps en composants (StepUseCase, StepLevel, etc.) |
| src/app/(dashboard)/dashboard/marketplace/page.tsx | 379 | BASSE | Extraire AgentCard, PublishModal |
| src/app/(dashboard)/dashboard/analytics/page.tsx | 359 | BASSE | Extraire StatsCards, Charts |
| src/components/home/HomeBlocks.tsx | 343 | BASSE | Extraire sections individuelles |
| src/components/connect/WithdrawButton.tsx | 335 | BASSE | Découper en sous-composants logiques |
| src/app/pricing/page.tsx | 328 | BASSE | Extraire PlanCard, ComparisonTable |
| ✅ src/types/index.ts | ~~349~~ 3 | FAIT | Découpé en database.types.ts + ui.types.ts |
| src/app/(dashboard)/dashboard/analytics/page.tsx | 328 | BASSE | Extraire ChartCard, MetricCard |
| src/types/index.ts | 316 | BASSE | Split en domain files (auth.ts, chat.ts, wallet.ts, etc.) |
| src/components/home/HomeBlocks.tsx | 308 | BASSE | Extraire chaque bloc en composant distinct |
| src/app/pricing/page.tsx | 306 | BASSE | Supprimer lignes vides/commentaires ou extraire PlanCard |
| src/components/connect/WithdrawButton.tsx | 303 | BASSE | Extraire modal de retrait en composant séparé |

**Notes** :
- Les fichiers avec lignes 303-328 peuvent probablement passer sous 300 en supprimant lignes vides/commentaires
- Les gros fichiers (>500 lignes) nécessitent un vrai découpage architectural
- Tous les fichiers compilent sans erreur TypeScript (tsc --noEmit passe)
- 39 warnings ESLint restants (react-hooks/set-state-in-effect principalement)
