# ERRORS.md — akasha-ai

| DATE | BUG | CAUSE | FIX |
|------|-----|-------|-----|
| 2026-08-23 | console.log en prod webhook Suno | Log debug oublié | Supprimé console.log ligne 11 src/app/api/webhooks/suno/route.ts |
| 2026-08-23 | Variable start let→const | Jamais réassignée | `let start` → `const start` AnimatedCounter.tsx:30 |
| 2026-08-23 | 35+ imports non utilisés | Imports jamais référencés | ✅ RÉSOLU - Script Python automatisé + corrections manuelles (35 imports supprimés) |
| 2026-08-23 | Script Python trop agressif | Suppression de variables nécessaires | ✅ RÉSOLU - Restauré useAuth, body parsing, useState manquants |
| 2026-08-23 | 17 fichiers >300 lignes (max-lines) | Code monolithique | ❌ RESTE 17-19 fichiers - voir liste détaillée ci-dessous |

## FICHIERS >300 LIGNES À DÉCOUPER (19 erreurs restantes)

**Progression ESLint** : 52 erreurs → 19 erreurs (33 erreurs corrigées, soit 63% de réduction)

Liste des fichiers dépassant la limite de 300 lignes (règle max-lines @purama/eslint-config) :

| Fichier | Lignes | Priorité | Action recommandée |
|---------|--------|----------|-------------------|
| src/app/page.tsx | 732 | HAUTE | Extraire Hero, FAQ, Comparison en composants séparés |
| src/app/(dashboard)/dashboard/studio/page.tsx | 730 | HAUTE | Extraire modals (TestModal, PublishModal) et helpers |
| src/app/(dashboard)/dashboard/settings/page.tsx | 628 | HAUTE | Découper par sections (Profile, Preferences, Security, etc.) |
| src/app/(dashboard)/dashboard/chat/page.tsx | 625 | HAUTE | Extraire ChatMessage, Sidebar, QuotaDisplay en composants |
| src/app/(dashboard)/dashboard/automation/page.tsx | 560 | MOYENNE | Extraire WorkflowCard, ExecutionLog, TriggerConfig |
| src/app/(dashboard)/dashboard/agents/page.tsx | 507 | MOYENNE | Extraire TestModal, AgentCard en fichiers séparés |
| src/app/financer/page.tsx | 484 | MOYENNE | Extraire formulaires multi-étapes en composants |
| src/app/(dashboard)/dashboard/ambassadeur/page.tsx | 463 | MOYENNE | Extraire StatsCard, ApplicationForm |
| src/app/(dashboard)/dashboard/xp/page.tsx | 363 | BASSE | Supprimer lignes vides, extraire 1-2 petits composants |
| src/app/(dashboard)/dashboard/collab/[id]/page.tsx | 362 | BASSE | Extraire MemberList, InviteModal |
| src/app/onboarding/page.tsx | 362 | BASSE | Extraire steps en composants (StepUseCase, StepLevel, etc.) |
| src/app/(dashboard)/dashboard/marketplace/page.tsx | 352 | BASSE | Extraire AgentCard, PublishModal |
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
