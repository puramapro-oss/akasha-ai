# ERRORS.md — akasha-ai

## Consolidation des reçus — 22 novembre 2026

Ce complément réunit les lots de livraison entrants `4123b25b80b0105003a6e71f61322565ea034633`
et `78a4b9da9e63686d6956da9e643395e3be4b2e4e`, puis les parcours Cycles de
`0767a3036276e3e7f6964fd938efaa24b208cf06` et les frontières de récompense de
`ca2eeecb83a2694ac475d8f6cd9f2f1912603c1a`, avec les protocoles de reprise ci-dessous.
Les nombres et mentions de qualification
des anciennes sections restent attribués à leur lot ; ils ne prouvent pas
l'exécution du candidat consolidé. Les reçus globaux du candidat sont joints à
sa PR et au rapport d'audit cumulatif.

| Défaut reproduit | Correction du candidat | Qualification et limite |
| --- | --- | --- |
| Rejeu d'un retrait susceptible de débiter ou compenser plusieurs fois | Journal privé, réservation et débit atomiques, droit d'émission unique, contrôle du reçu Stripe, compensation unique et état de rapprochement en cas d'incertitude | Tests SQL, route, service et vrai hook React ; aucun transfert réel ni schéma de production reçu. |
| Demande non admise impossible à modifier sans risquer la réutilisation tardive de sa clé | Annulation durable avant une nouvelle intention ; une réservation déjà admise garde son reçu | Course des deux ordres et rejeu de l'ancienne clé couverts dans les régressions ; une annulation cliente ne suffit jamais. |
| Séquence email réémise après perte de confirmation ou préférence ignorée | Une admission SQL durable, consentement newsletter explicite, veto de catégorie, reçu fournisseur et journal confirmés ensemble | Ancienne RPC de confirmation révoquée pour tous les rôles applicatifs ; aucun envoi réel ni réception en boîte attestés. |
| Deux protocoles de partage concurrents, dont un sans crédit du solde dépensable | Un seul écrivain `record_social_share`, une seule identité `request_id`, contrôle de l'acteur par le wrapper entrant, transaction partage/journal/solde et relecture après tous les déclencheurs | Reprise des vrais reçus entrants sans recrédit ; les suites natives courantes restent NON TESTÉES localement après le refus de sockets ; leur réception relève de la CI du candidat exact. |
| Contact annoncé remis malgré une erreur résolue du SDK ou une insertion non confirmée | Reçu d'enregistrement vérifié avant les emails, statuts d'acceptation séparés, délais bornés et brouillon conservé | Aucun faux accusé de remise ; une nouvelle soumission manuelle n'est pas présentée comme un rejeu idempotent. |
| Nouveaux journaux privés absents de l'export personnel | Projection authentifiée des reçus propres, des annulations et des achats dans la vraie route GET | Tests SQL sous RLS, refus anonyme et isolation des comptes ; aucun jeton interne exporté. |
| Collisions de versions et dépendance aux définitions SQL entrantes | Neuf versions distinctes, extension de droits avant les quatre extensions de journaux, références adaptées et contenu des cinq migrations entrantes conservé | Les collisions historiques `20260926` et `20261111` attendent un rapprochement avec l'historique réel avant toute application par la CLI. |

Les garanties et la transition coordonnée sont détaillées dans
[`tests/notification-share-reliability/README.md`](tests/notification-share-reliability/README.md).
Les cadeaux, la boutique et la protection des champs privilégiés du profil sont
conservés et traversés par un test permanent de composition. Les limites de
production, de fournisseurs et de charge demeurent distinctes des tests locaux.

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

## Historique des découpages — août 2026

Les nombres et versions ci-dessous décrivent les étapes de cette campagne ancienne. Ils ne constituent pas un état actuel du lint ou du build.

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

**État final consigné le 24 août** : 0 fichier >300L. Le tableau suivant décrit l’étape intermédiaire antérieure au dernier découpage.

| Fichier | Lignes | Priorité | Action recommandée |
|---------|--------|----------|-------------------|
| src/app/financer/page.tsx | 521 | HAUTE | Extraire formulaires multi-étapes en composants step-by-step + types + hooks + wizard state management |

**Notes intermédiaires conservées de la campagne d’août** :
- Tous les fichiers compilent sans erreur TypeScript (tsc --noEmit passe)
- npm run build : ✅ OK (Next.js 15.3.0)
- 1 erreur ESLint restante (max-lines sur financer/page.tsx)
- 43 warnings ESLint (react-hooks/set-state-in-effect principalement)

## Corrections qualifiées en novembre 2026

| DATE | BUG | CAUSE | FIX |
|------|-----|-------|-----|
| 2026-11-10 | Réponses et historiques tardifs, double envoi, indicateur bloqué et texte partiel perdu dans le chat | Pas de propriétaire de requête, lecture SSE par ligne et nettoyage non différencié | Candidat isolé : cycle de vie annulable, lecteur de flux borné, identité React ; 89 tests et 12 scénarios navigateur PASS. Voir tests/model-selection/CHAT-RECOVERY-20261110.md ; non déployé. |
| 2026-11-10 | Sessions/profils tardifs, souscriptions répétées, renouvellement ignoré et nettoyage excessif lors de déconnexion refusée | Cycle de vie dépendant du profil et absence d’invalidation des requêtes anciennes | Candidat isolé : useAuth stabilisé, notifications synchrones, lectures bornées, reprise du chat ; 110 tests, 18 scénarios Chrome, TypeScript et lint ciblé PASS. Non déployé ; voir tests/model-selection/AUTH-RECOVERY-20261110.md. |
| 2026-11-11 | Profil et correspondances Entraide incompatibles avec les privilèges SQL ; blocages entrants ignorés | Lectures navigateur trop larges et matching exécuté côté client | Projection explicite du profil propre, matching serveur, identité vérifiée et blocages dans les deux sens ; aucune modification du moteur privé ou des migrations. |
| 2026-11-11 | Données ou succès Entraide publiés après changement de compte ; chargement bloqué sur une session périmée | Requêtes non liées à une époque de session et erreurs de stockage confondues avec une absence de données | Transport lié à l’acteur et au jeton, annulation et délais bornés, refus des réponses périmées, actualisation explicite et conservation des brouillons. Les mutations ne sont pas réémises automatiquement. |
| 2026-11-11 | Faux succès de signalement et identité de cookie différente du bearer explicite | Erreurs d’insertion/comptage ignorées et admission non liée à l’acteur demandé | Même vérification d’acteur sur les routes ; erreurs génériques explicites, contrôle de l’auto-signalement insensible à la casse UUID. Une erreur après insertion ne prouve pas son annulation. |
| 2026-11-11 | Un blocage pertinent pouvait disparaître d’une réponse PostgREST plafonnée et laisser réapparaître le profil dans le matching | Lecture non bornée de tous les blocages de l’acteur, sans preuve de complétude | Lecture des seuls candidats évalués par lots de 100 UUID, dans les deux sens ; compte exact et contrôle des identités avant toute correspondance. Une réponse partielle échoue explicitement. La troncature des candidats est annoncée selon leur total exact. |
| 2026-11-11 | Peer SWC non satisfait après installation du verrou publié | Le helper facultatif imbriqué pouvait être élagué et SWC résolvait le helper 0.5.15 de Next | Dépendance runtime explicite `@swc/helpers` 0.5.24 ; verrou régénéré par npm, Next conserve sa version 0.5.15 imbriquée. Toutes les autres entrées amont sont préservées. |
| 2026-11-11 | Contact Entraide admis malgré une réponse de blocage tronquée ; compte absent interprété comme zéro | Énumération non bornée des blocages du destinataire et compte exact non validé | Lecture de la paire destinataire/demandeur, contrôle des deux UUID et de la complétude ; compte absent ou invalide refusé explicitement. |
| 2026-11-11 | Réponses anciennes, états de chargement et mutations visibles après changement de compte | Lectures asynchrones et callbacks sans garde commune au commit React | Ressource partagée avec acteur, paramètres, annulation, délai de 15 secondes et générations ; les callbacks périmés ne publient plus dans la nouvelle interface. |
| 2026-11-11 | Préférences de notification annoncées enregistrées sans écriture réelle ; erreurs de profil/accent ignorées | Simulation par temporisation et résultats de base non contrôlés | Lecture et upsert dans la table existante de préférences, conservation des clés inconnues et erreurs vérifiées ; brouillons conservés et relecture du profil récupérable. |
| 2026-11-11 | Profil masqué par un chargement permanent après refus de relecture | Le contrat auth peut résoudre la promesse tout en exposant un profil absent et une erreur | Cache limité au même acteur et contrôlé par identifiant, formulaire conservé, erreur visible et bouton de reprise lié à la même instance auth. |
| 2026-11-11 | Navigation ou succès après refus de sauvegarde, génération de clé malgré échec de désactivation, espace annoncé créé sans membre administrateur | Erreurs résolues du SDK et effets tardifs non contrôlés | Contrôle des erreurs avant la suite du parcours, puis garde d'acteur avant navigation, toast, relecture ou fermeture d'éditeur. |
| 2026-11-11 | Crédit de partage annoncé sans confirmation de stockage | Deux écritures du helper ne fournissent pas de résultat vérifiable à la page | La page annonce uniquement l'ouverture demandée et relit les statistiques persistées ; aucune hausse de points supposée. Le helper reste à qualifier séparément. |
| 2026-11-11 | 48 erreurs et 8 avertissements dans le lint CI global | Cycles d'effets, rendu non pur, JSX et bindings inutilisés ; divergence du lint implicite local | Corrections comportementales, rendu stable, extraction du schéma de retrait inchangé et configuration locale alignée sur la configuration CI canonique ; aucune règle désactivée. |
| 2026-11-11 | Contrôle de bootstrap intermittent sur macOS | Fixture de concurrence dépendante de l'ordonnancement de fs.watch | Interception déterministe de la création temporaire, avec les mêmes vraies opérations de fichiers et assertions ; 17 contrôles de préparation réussis. |

### Qualification intégrée — 11 novembre 2026

- **PASS applicatif intégré** : **537/537 tests dans 24 fichiers**, aucun échec, cas ignoré ou cas à faire. Exécution de la commande standard avec Node 22.23.4 sur l'installation propre et les 447 entrées du candidat assemblé. Les 44 tests de hooks et 58 tests UI sont inclus dans les 537 ; les essais précédents ne s'y ajoutent pas.
- **PASS préparation et gardes CI** : **17/17 contrôles setup** et **7/7 gardes source Stripe**, comptés séparément des tests applicatifs.
- **PASS types et lint** : génération des types Next et TypeScript complet réussis ; lint strict de 76 fichiers modifiés et lint CI global de **350 fichiers, 0 erreur et 0 avertissement**, avec la configuration canonique `eslint.config.mjs`.
- **PASS compilation** : La compilation Next 16.2.11/Turbopack réussit ; le manifeste contient **115 routes compilées**, dont la page Entraide et sa route de correspondances. Les paramètres fournisseurs sont synthétiques. Les polices publiques réelles sont obtenues par le transport borné vérifié ; les processus et listeners temporaires sont arrêtés.
- **PASS frontière client/serveur** : une analyse compilée distincte détecte **3 sources du moteur privé côté serveur et aucune inclusion de ce moteur dans les chunks client**. Le contrôle positif détecte la vraie page cliente Entraide. Cette analyse ne prétend pas établir une identité binaire avec le build précédent.
- **PASS SQL natif conservé sur entrées identiques** : **10/10 cas de confidentialité Entraide** et **24/24 cas de reprise Stripe**, exécutés sur PostgreSQL 18.4 neuf, sans écoute TCP, puis nettoyé. Les 14 entrées source uniques ont été revérifiées identiques au dépôt et au layout final à 20:27 UTC. Ce contrôle d'identité n'est pas une nouvelle exécution SQL ni une exécution des fournisseurs ou handlers HTTP déployés.
- **PASS installation et peers ciblés** : `npm ci` réel en 35,89 secondes, puis inventaire SWC/Next/Vite/PostCSS sans erreur. Le verrou conserve 812 entrées et les résolutions amont hors correctif ; SMARANA vise le commit exact `531cc653`. Runtime d'installation : Node 26.0.0 / npm 11.12.1.
- **PARTIEL inventaire global** : cinq dépendances de développement des paquets privés voisins et deux modules WebAssembly supplémentaires restent signalés par `npm ls --omit=dev --all`. Voir `tests/packaging/README.md`. Ces diagnostics ne sont ni supprimés ni assimilés à un audit de vulnérabilités.
- **CI amont observée avant publication** : le run `43064553320` sur `ad36ec7b` passe ses 17 contrôles setup, puis échoue à l'admission des accès de lecture aux dépôts privés ; les étapes applicatives suivantes sont ignorées. La qualification locale macOS/Node 22 ne valide pas cette CI Linux/Node 24. Le résultat de CI du prochain commit doit être lu séparément.
- **BLOQUÉ audit registre** : l'audit npm a été refusé par le contrôle automatique de divulgation du graphe privé. Aucun résultat « zéro vulnérabilité » n'est attribué au verrou final.

Les essais intermédiaires, dont les suites 391 et 435, l'échec initial de la fixture macOS et le diagnostic lint 48/8, restent des preuves historiques. Le résultat courant est celui de l'union finale, sans addition des compteurs. Les rapports de transport HTTP utilisent le SDK réel avec des réponses synthétiques contrôlées.

### Limites fonctionnelles et d'exploitation encore ouvertes

- **Préférences email — PASS local au 22 novembre** : le cron consulte les catégories et la pause enregistrées, refuse les lectures en erreur et vérifie l'acceptation du fournisseur puis la confirmation du journal. Une clé stable protège les reprises côté fournisseur ; la remise réelle en boîte reste NON TESTÉE. Voir `tests/delivery/README.md`.
- **Crédit de partage — PASS local au 22 novembre** : les deux insertions indépendantes sont remplacées par un RPC authentifié qui écrit partage, journal et solde dans une transaction, avec plafond et prix de récompense contrôlés côté serveur. Concurrence, rollback et rejeu sont exercés sur PostgreSQL natif ; une ouverture de réseau social ne prouve pas une publication externe. Voir `tests/delivery/README.md`.
- **Écritures multiples — PARTIEL** : l'atomicité globale du portefeuille/retrait, de l'espace et de son membre, des missions et de l'insertion/comptage des signalements n'est pas établie par ce lot. Les lectures de candidats et de blocages n'utilisent pas un instantané transactionnel commun. Une erreur après une première écriture ne prouve pas son annulation ; une annulation cliente ne prouve pas une annulation serveur.
- **Fournisseurs et production — NON TESTÉ** : aucune qualification des paiements réels, du déploiement, des secrets distants, de la charge ou de la latence réelle. Les règles et contrats financiers conservent leur qualification propre.

### Maintenance des dépendances — 22 novembre 2026

- **PASS correctif ciblé** : Next/configuration ESLint Next 16.4.6, Zod 4.6.7 et transitifs vulnérables rafraîchis par npm. Les huit entrées privées, le commit SMARANA `531cc653` et les 18 sources partagées sont inchangés. Le type généré `root-params` est ajouté par Next ; la branche de revue est exclue des déploiements automatiques.
- **PASS vérifications locales** : 656/656 tests applicatifs dans 37 fichiers, 31/31 contrôles de préparation, 7/7 gardes Stripe, 14/14 cas Karma, types complets, build Next/Turbopack et quatre contrôles HTTP sur le serveur construit. Sharp 0.35.5 charge librsvg 2.63.2 ; PNG, SVG et `next/og` sont exercés au runtime.
- **PARTIEL inventaire et maintenance** : `npm ls --all` et `--omit=dev --all` sortent à 1 pour deux anciennes plages de développement Vitest dans les paquets privés liés. Le contrôle des 1 626 arêtes installées ne relève aucune autre incompatibilité requise. ESLint 9 reste compatible avec les plugins Next utilisés mais est en fin de support ; quatre nouveaux avertissements de navigation Next restent explicitement ouverts.
- **BLOQUÉ navigateur et audit réseau** : Chromium échoue avant les assertions à cause d'un socket Unix refusé dans le sandbox. L'envoi de l'inventaire à npm a été refusé par le contrôle automatique d'autorisation. Une comparaison locale bornée à 54 plages d'avis retenues trouve 38 correspondances dans la base et aucune dans le candidat ; elle ne constitue pas un nouvel audit npm.

Voir [le rapport de qualification](tests/packaging/DEPENDENCY-SECURITY-20261122.md) pour les versions, commandes, frontières de test, réserves de transport privé et procédure navigateur préparée. Les résultats précédents restent historiques ; aucun fournisseur, compte réel, migration ou déploiement n'est qualifié par ce lot.

### Confirmations et récompenses — 22 novembre 2026

- **PASS régressions applicatives** : 813/813 tests dans 47 fichiers après correction des confirmations de partage, boutique et cadeau. Les 19 cas cron/partage échouent sur l'arbre de départ avec les mêmes fixtures corrigées ; deux cas supplémentaires reproduisent le blocage de reprise au plafond ou avec solde épuisé avant de passer après correction.
- **PASS SQL local** : 18/18 cas PostgreSQL 17.12, avec connexions indépendantes et attente de verrou observée, transactions partage/cadeau/achat, rejeux, échecs injectés et restrictions de profil. Les sept entrées du banc natif sont identiques après la dernière correction UI ; serveur, cluster et listener temporaires sont supprimés.
- **PASS types, PARTIEL lint** : types Next et TypeScript complet passent. Lint global sans erreur, avec les quatre avertissements de navigation Next déjà ouverts par le lot dépendances.
- **PASS remise supportée, PARTIEL catalogue** : les treize références et prix existants sont conservés ; seuls `credits-10`, `credits-50` et `ticket-1` sont échangeables. Les autres récompenses sont explicitement indisponibles sans débit. Le ticket exige un vrai tirage futur. Un coupon quotidien reste enregistré en attente d'activation, avec réponse HTTP 202 et référence visible ; il n'est pas annoncé utilisable.
- **BLOQUÉ build local final et navigateur** : la préparation du build final rencontre un disque saturé avant lancement de Next ; les CSS originaux du cache de polices ne sont pas disponibles en fichiers, seuls les onze WOFF2 sont vérifiés. Le build du lot dépendances reste une preuve historique. Le refus de socket Chromium déjà constaté reste ouvert ; aucun parcours navigateur n'est déclaré réussi par substitution de tests DOM.
- **NON TESTÉ déploiement** : migrations et nouvelles routes doivent être livrées ensemble selon le guide de réception. Les anciens clients écrivant directement leurs récompenses deviennent incompatibles avec les restrictions SQL. Aucun déploiement sans interruption, fournisseur réel ou historique distant n'est certifié.

La réception de ce lot et les commandes reproductibles sont décrites dans [tests/delivery/README.md](tests/delivery/README.md). Les autres limites d'atomicité listées plus haut restent ouvertes.

### Consolidation des confirmations — 22 novembre 2026

- **PASS local intégré** : consolidation sur la tête publiée `4123b25b80b0105003a6e71f61322565ea034633`, arbre `921f7bb4a0a30272b153873b064fb2e5749b5377` ; **925/925 tests dans 50 fichiers**, sans échec ni test ignoré. Ce total comprend les sous-suites suivantes et remplace le candidat local antérieur, sans addition des compteurs historiques.
- **PASS régressions SQL** : 67 échecs reproduits avant correction ; 129/129 après durcissement et cinq cas supplémentaires. Le contenu exact des écritures `RETURNING` est contrôlé, les résultats supprimés ou réécrits déclenchent un rollback, les droits hérités de `PUBLIC` et de colonnes sont révoqués, les douze champs de profil autorisés restent disponibles. Aucun nouveau nom de migration ; les contrats existants sont conservés.
- **PASS confirmations et reprise** : stockage partagé durable, verrou entre onglets jusqu'à validation, annulation liée à l'acteur et délai couvrant aussi le corps de réponse ; reprise conservée au plafond ou après épuisement du solde. Un refus de stockage ne laisse pas le bouton bloqué. Le RPC de statistiques compte l'historique complet plutôt qu'une page éventuellement tronquée.
- **PASS email/contact simulés** : cohortes paginées sans offset, préférences préservées, reçu exact relu après le booléen SQL, budget de tentatives fournisseur et arrêt sur quota ; modèles et clés d'idempotence reçus inchangés. Le contact distingue réception durable et notification partielle et conserve les brouillons non reçus. Aucun message réel envoyé.
- **NON TESTÉ localement, gates CI préparés** : 20 cas PostgreSQL natifs avec douze preuves de blocage réelles et cinq scénarios Chromium sur le helper canonique. La CI doit exécuter ces versions ainsi que le build final ; le refus local de sockets et l'espace disque insuffisant ne sont pas assimilés à des réussites.
- **PARTIEL fonctionnel et NON TESTÉ production** : trois références de boutique restent échangeables, dix indisponibles ; les coupons restent en attente d'activation. Les migrations, routes et interfaces nécessitent une bascule coordonnée. La remise fournisseur, les flux complets déployés, la charge et la latence réelle restent à qualifier.
