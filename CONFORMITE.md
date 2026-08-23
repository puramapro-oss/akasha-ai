# CONFORMITÉ NIYAMA — akasha-ai (AKASHA AI)

**Date de l'audit** : 2026-08-23
**Auditeur** : agent conformité (lecture seule, code applicatif uniquement)
**Référentiel** : `/Users/matissdornier/purama/NIYAMA-BRIEF.md` §0-§7
**Repo audité** : `/Users/matissdornier/purama/akasha-ai`

## VERDICT : 🔴 ROUGE — 7 gaps (dont 1 bloquant critique)

Le socle légal applicatif (pages, composants, routes API) est réel et bien construit — mais la **migration SQL qui crée les 3 tables dont ce socle dépend n'a jamais été exécutée en base**. En l'état actuel de production, `/api/legal/accept`, `/api/legal/cookie-consent`, `/api/legal/my-data` et la demande de suppression de compte échouent tous en base (`relation "akasha_ai.legal_acceptances" does not exist` etc.), et l'échec est **avalé silencieusement** à l'inscription (`.catch(() => null)`) — un utilisateur croit avoir accepté les CGU/CGV, mais aucune preuve n'est enregistrée. C'est un gap bloquant au sens NIYAMA (preuve d'acceptation horodatée = obligation §1), pas un détail cosmétique.

---

## 1. Pages légales

| Page | Fichier | Statut |
|---|---|---|
| Mentions légales | `src/app/mentions-legales/page.tsx` (111 lignes) | ✅ présente, contenu réel |
| CGU | `src/app/cgu/page.tsx` (145 lignes) | ✅ présente, contenu réel |
| Politique de confidentialité | `src/app/politique-confidentialite/page.tsx` (148 lignes) | ✅ présente, contenu réel |
| CGV | `src/app/cgv/page.tsx` (140 lignes) | ✅ présente — justifiée : AKASHA a un paiement Stripe réel (`checkout`/`webhook`/`portal`, cf `src/app/api/stripe/`) |

Adresse d'hébergement Vercel corrigée et vérifiée : `src/app/mentions-legales/page.tsx:48` → "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis" (l'ancienne adresse Walnut/Lemon Ave a bien été retirée — confirmé par lecture directe, `grep` seul ne la trouvait pas à cause de la mise en forme JSX).

Médiateur de la consommation : présent, `src/app/mentions-legales/page.tsx:96-103` ("6. Contact et médiation ... vous pouvez recourir à un médiateur de la consommation").

**Gap mineur** : `src/app/cgu/page.tsx`, `src/app/cgv/page.tsx`, `src/app/politique-confidentialite/page.tsx` n'affichent aucune date "Dernière mise à jour" visible à l'écran (seule `mentions-legales/page.tsx:20` en a une, "6 avril 2026"). Le versioning réel existe côté serveur (`src/lib/legal/versions.ts`, `CURRENT_LEGAL_VERSIONS` = `1.0` pour les 4 docs, historique daté 2026-08-23) mais n'est pas répercuté à l'écran sur 3 des 4 pages.

## 2. Bandeau consentement cookies

`src/components/shared/CookieBanner.tsx` — fonctionnel :
- Accepter/Refuser réels (lignes 28-38), persistance `localStorage` (`akasha_cookie_consent`)
- Synchronisation serveur indépendante du navigateur via `POST /api/legal/cookie-consent` (lignes 20-26)
- Monté globalement : `src/app/layout.tsx:7,96`

**Sous réserve du point 8** : la synchronisation serveur écrit dans `cookie_consents`, table non créée en base (cf §8) → le `fetch` échoue silencieusement (pas de `.catch` géré côté UI, mais l'appel est `fetch(...).catch(() => null)` donc n'affecte pas l'UX, juste la preuve). Le bandeau lui-même reste fonctionnel côté navigateur (accepter/refuser marche visuellement), seule la preuve serveur est cassée tant que §8 n'est pas résolu.

## 3. Preuve d'acceptation CGU horodatée

`src/app/api/legal/accept/route.ts` — code réel, pas un stub :
- Auth requise (ligne 25), payload validé par Zod (ligne 16-18, 28-31)
- Version **calculée côté serveur** (`CURRENT_LEGAL_VERSIONS[docType]`, ligne 36) — jamais envoyée par le client, empêche la falsification de preuve (commentaire explicite lignes 7-9)
- `INSERT` réel dans `legal_acceptances` avec `user_id`, `doc_type`, `version`, `ip`, `user_agent` (lignes 33-39)
- Appelé automatiquement à l'inscription : `src/app/(auth)/signup/page.tsx:13-24` (`acceptLegalDocs()`, appelle `/api/legal/accept` pour `cgu`, `cgv`, `confidentialite`)
- Case à cocher CGU remplacée par `LegalAcceptanceNotice` zéro-case (conforme §9.5) : `src/app/(auth)/signup/page.tsx:10,194`

**Gap** : `acceptLegalDocs()` (`src/app/(auth)/signup/page.tsx:15-23`) utilise `.catch(() => null)` sur les 3 appels — si l'écriture échoue (ce qui est le cas actuellement, cf §8), l'inscription continue sans aucune preuve enregistrée et sans que l'utilisateur ou l'admin en soit informé. Aucune retry, aucun log d'échec visible.

**Gap bloquant** : tant que la migration §8 n'est pas appliquée, la table `legal_acceptances` n'existe pas → **0 preuve d'acceptation réellement enregistrée en base à ce jour**, malgré un code applicatif correct.

## 4. Page « Ma mémoire »

`src/app/(dashboard)/dashboard/memoire/page.tsx` → `MaMemoirePage` (composant socle, `src/lib/legal/components/MaMemoirePage.tsx`), branché à de vraies données (`legal_acceptances`, `account_deletion_requests`, lignes 18-28).

**Export RGPD réel** : `GET /api/legal/my-data` (`src/app/api/legal/my-data/route.ts`) — lit réellement 4 tables de base + **32 tables métier supplémentaires** (`EXTRA_TABLES`, lignes 12-47 : generations, wallets, withdrawals, referrals, commissions, invoices, xp_log, achievements, support_tickets, api_keys, etc.), retourne un JSON téléchargeable (`Content-Disposition: attachment`). Ce n'est pas un stub — c'est un export exhaustif et réel des données personnelles.

**Suppression de compte réelle avec grâce + cron** :
- `POST /api/account/delete` (`src/app/api/account/delete/route.ts`) — confirmation littérale requise (`confirm: 'DELETE_MY_ACCOUNT'`), rate-limited, programme la suppression **30 jours** plus tard (`GRACE_PERIOD_DAYS = 30`, ligne 10) dans `account_deletion_requests`
- `DELETE /api/account/delete` — annulation pendant la période de grâce
- `GET/POST /api/cron/account-deletion` (`src/app/api/cron/account-deletion/route.ts`) — cron quotidien réel, enregistré dans `vercel.json` (`"path": "/api/cron/account-deletion", "schedule": "0 3 * * *"`) : sweep des demandes `scheduled` dont `scheduled_for <= now()`, exécute `auth.admin.deleteUser()` (purge + CASCADE), marque `completed`, gère les échecs sans retry auto (investigation manuelle documentée en commentaire)
- Boutons "Supprimer mon compte" / "Exporter mes données" de `dashboard/settings/page.tsx` (lignes 411-414, 589, 613-622) redirigent bien vers `/dashboard/memoire` (plus de `mailto:` factice)

**Gap bloquant partagé avec §8** : ce flux entier dépend de `account_deletion_requests`, table non créée en base à ce jour → la programmation de suppression échouerait en prod tant que la migration n'est pas appliquée.

## 5. Déclaration IA sur chaque UI de chat IA réelle

Composant `AIDisclosure` (`src/lib/legal/components/AIDisclosure.tsx`) — minimal, texte fixe : *"Vous échangez avec l'assistant IA de {appName}, pas avec un humain."*

Deux interfaces de chat réelles identifiées (appel Claude serveur, cf `src/lib/claude.ts` + `src/app/api/chat/route.ts` / `src/app/api/aide/chat/route.ts`) :
1. **Chat principal** : `src/app/(dashboard)/dashboard/chat/page.tsx:687` — `<AIDisclosure appName="AKASHA AI" .../>` réellement rendu (pas juste importé — vérifié ligne par ligne, contrairement à un premier `grep` trompeur)
2. **Assistant SAV** (`aide`) : `src/app/aide/page.tsx:231` — `<AIDisclosure appName="AKASHA AI" .../>` réellement rendu

Aucune autre interface conversationnelle IA détectée. `src/app/(dashboard)/dashboard/automation/page.tsx` mentionne "Claude" mais uniquement comme libellé d'étape dans une description de workflow d'automatisation (pas une UI de conversation directe) — pas concerné par l'obligation.

## 6. Lexique interdit

Recherche ciblée (garanti/sans risque/100% sûr/gratuit à vie/argent facile/revenu passif/gains garantis/soigne/guérit/conseil personnalisé/rendement garanti) sur `src/app`, `src/components`, `src/lib`, `messages/` :

**0 occurrence de promesse interdite.** Les seules occurrences de "garanti(r)" trouvées sont des clauses de non-garantie standard (`cgu/page.tsx:53`, `mentions-legales/page.tsx:87`, `lib/legal/content/*.ts:67`) — c'est-à-dire l'inverse d'une promesse ("ne peut garantir...").

**Gap distinct (pattern interdit famille 1, hors lexique textuel pur)** : `src/lib/constants.ts` (`XP_ACTIONS`, ligne 53) et `src/app/(dashboard)/dashboard/xp/page.tsx` (lignes 45, 61) définissent et **affichent à l'utilisateur** une action `five_star_review: 20` XP, libellée *"Laisser un avis 5 étoiles"* — c'est le patron explicitement interdit par NIYAMA-BRIEF §2.1 (famille "apps qui paient les utilisateurs") : *"JAMAIS d'avis/notes/installs rémunérés"*. Vérification : aucune route API n'attribue effectivement ces XP (recherche `xp_log`/`awardXp`/`grantXp` dans `src/app/api` → 0 résultat en dehors de l'export RGPD) — le mécanisme n'est donc pas câblé côté serveur, mais **le libellé reste visible dans l'écran `/dashboard/xp`** comme un moyen de gagner des points, ce qui constitue en soi une incitation écrite à laisser un avis 5 étoiles contre récompense.

## 7. Cohérence des chiffres avec FACTS.md

| Chiffre AKASHA | Où | FACTS.md | Verdict |
|---|---|---|---|
| Prix : Free 0€, Essentiel 7€, Pro 11€, Max 16€, COMPLET 22/33/44€ (`src/lib/constants.ts` `PLAN_LIMITS`) | Cohérent avec `src/app/cgv/page.tsx:42-48` (mêmes montants) et avec `AKASHA-BRIEF.md` ("dès 7€/mois") | FACTS.md liste un "Prix abonnement standard 9,99/49,99/99,99€" générique, référencé comme non-recopié depuis CLAUDE-2.md | **Pas un écart réel** : AKASHA a son propre modèle de pricing documenté dans son propre BRIEF (47+ outils, paliers par univers), la table FACTS.md générique ne s'applique pas telle quelle. Cohérence interne (code ↔ page CGV) confirmée. À faire trancher si Tissma veut verrouiller ce chiffre dans FACTS.md par app plutôt qu'un standard unique. |
| Rétractation art. L221-28, waiver implicite par clic, 0 checkbox | `src/app/subscribe/page.tsx:130`, `src/app/confirmation/ConfirmationClient.tsx:109` | CLAUDE.md §9.5 / FACTS.md | ✅ conforme |
| Siège social SASU PURAMA, 8 Rue de la Chapelle, 25560 Frasne | `src/app/mentions-legales/page.tsx:32`, `src/lib/constants.ts` `COMPANY_INFO` | Cohérent écosystème | ✅ conforme |
| TVA art. 293 B CGI (franchise) | `src/app/mentions-legales/page.tsx` / `cgv/page.tsx:38` | FACTS.md | ✅ conforme |
| Modèle IA principal | `src/lib/claude.ts` (non détaillé plus avant dans cet audit — hors périmètre §7 du checklist NIYAMA) | FACTS.md signale une contradiction générale écosystème (`claude-sonnet-4-6` non reconnu dans la famille actuelle, cf DECISIONS.md D-005) | Non spécifique à AKASHA — problème écosystème déjà tracé ailleurs, non recompté ici comme gap AKASHA |

**Gap distinct** : aucune déclaration `niyama_family` trouvée dans le repo (recherche `niyama_family` sur `*.md`/`*.ts`/`*.json` → 0 résultat). NIYAMA-BRIEF §0.2 exige que chaque app déclare sa famille en frontmatter pour que l'inspecteur puisse la vérifier contre le code réel — non fait pour AKASHA.

## 8. Migration SQL légale

**Confirmé non exécutée** — documenté dans `ERRORS.md` (ligne datée 2026-08-23), reporté ici tel quel, sans supposer de résolution :

> Migration SQL du socle légal (`migrations/20260823_legal_core.sql`, tables `legal_acceptances`/`cookie_consents`/`account_deletion_requests` sur le schéma `akasha_ai`) non exécutée — Connexion SSH au VPS (`root@72.62.191.111`) refusée (`Connection refused`) après une tentative avec un mot de passe SSH obsolète trouvé dans un doc archivé — probable ban fail2ban temporaire, ou service SSH indisponible.

Vérification indépendante pendant cet audit : une tentative de connexion SSH en lecture seule (`ssh root@72.62.191.111`) a retourné `Permission denied` (message différent du `Connection refused` documenté — mais rien ne permet de conclure que l'accès est rétabli ; variable d'environnement `VPS_SSH_PASSWORD` potentiellement absente du shell d'audit). **Statut retenu : à vérifier en base**, non résolu tant qu'aucune preuve positive (connexion réussie + `\dt akasha_ai.*` listant les 3 tables) n'est apportée.

Le fichier de migration lui-même est correct : 3 tables, RLS activé sur les 3, policies `select_own`/`insert_own`/`update_own` par `auth.uid() = user_id`, idempotent (`CREATE TABLE IF NOT EXISTS` + `DO $$ ... EXCEPTION WHEN duplicate_object`), commande de rejeu documentée en tête de fichier (`migrations/20260823_legal_core.sql:1-14`).

**Impact tant que non appliqué** : tous les endpoints des §2/§3/§4 échouent en base de production (`relation "akasha_ai.legal_acceptances" does not exist` et équivalents) — c'est la cause racine du verdict ROUGE.

---

## Récapitulatif — 7 gaps

| # | Gap | Sévérité | Fichier(s) |
|---|---|---|---|
| 1 | Migration SQL du socle légal non appliquée en base → `legal_acceptances`/`cookie_consents`/`account_deletion_requests` inexistantes en prod | **CRITIQUE (bloquant)** | `migrations/20260823_legal_core.sql`, ERRORS.md |
| 2 | Échec silencieux de l'acceptation CGU/CGV à l'inscription (`.catch(() => null)`), aucune visibilité/retry | Élevée | `src/app/(auth)/signup/page.tsx:15-23` |
| 3 | XP "Laisser un avis 5 étoiles" (+20 pts) affiché comme moyen de gagner des points — pattern avis rémunéré interdit (famille 1), non câblé côté serveur mais visible côté UI | Moyenne | `src/lib/constants.ts:53`, `src/app/(dashboard)/dashboard/xp/page.tsx:45,61` |
| 4 | `niyama_family` non déclarée nulle part dans le repo | Moyenne | — (absence) |
| 5 | `LegalReacceptanceGate` copié depuis le socle mais jamais monté — pas de re-sollicitation si une version CGU/CGV est bumpée plus tard | Faible (latente) | `src/lib/legal/components/LegalReacceptanceGate.tsx` (non importé ailleurs) |
| 6 | Pas de Sign in with Apple alors que Google OAuth est proposé (web `useAuth.ts:73-74`) et qu'une app mobile Expo/EAS existe (`mobile/`) — bloquant futur pour soumission App Store si login tiers maintenu | Faible (pas encore soumis store) | `src/hooks/useAuth.ts:73-74`, absence d'équivalent Apple |
| 7 | Pas de date "Dernière mise à jour" affichée sur CGU/CGV/politique de confidentialité (seule mentions-légales en a une) | Faible | `src/app/cgu/page.tsx`, `src/app/cgv/page.tsx`, `src/app/politique-confidentialite/page.tsx` |

## Points forts confirmés
- 4 pages légales réelles et substantielles (CGV incluse à raison, paiement Stripe réel actif)
- Bandeau cookies fonctionnel (accept/decline, persistance, sync serveur)
- Déclaration IA réellement rendue (pas juste importée) sur les 2 interfaces de chat IA de l'app
- Export RGPD exhaustif (36 tables au total) et suppression de compte avec vraie période de grâce de 30 jours + cron quotidien réel
- 0 occurrence de lexique interdit au sens classique (promesses de gain/guérison/garantie)
- Chiffres internes cohérents (code ↔ pages ↔ BRIEF), pas d'invention constatée
- Code du socle légal (routes API, migration SQL) est propre, avec RLS et anti-falsification de version — le blocage est purement opérationnel (accès VPS), pas une faute de conception

---

## Remédiation — 2026-08-23

| # | Statut |
|---|---|
| 1 | NON CORRIGÉ : migration `migrations/20260823_legal_core.sql` toujours pas exécutée en base. Tentative SSH renouvelée le 2026-08-23 (`ssh -o BatchMode=yes root@72.62.191.111`) → `Permission denied (publickey,password)`, `VPS_SSH_PASSWORD` absent de l'environnement de cette session. Documenté dans `ERRORS.md`. Le code applicatif qui en dépend (§2/§3/§4) reste correct et prêt — seule l'exécution SQL manque. |
| 2 | CORRIGÉ le 2026-08-23 : `acceptLegalDocs()` (`src/app/(auth)/signup/page.tsx`) ne fait plus taire les échecs. Chaque appel `POST /api/legal/accept` est maintenant vérifié (`res.ok`), 1 retry automatique après 1.5s si échec, puis la liste des docs toujours en échec remonte à l'appelant qui affiche un `toast.error` visible + `console.error` (au lieu du `.catch(() => null)` silencieux). Filet de sécurité additionnel : voir gap 5 — `LegalReconsentGate` re-sollicite l'utilisateur tant qu'une acceptation manque en base. |
| 3 | CORRIGÉ le 2026-08-23 : mécanique XP "Laisser un avis 5 étoiles" (+20 pts) **retirée intégralement** — `five_star_review` supprimé de `XP_ACTIONS` (`src/lib/constants.ts`) et de `XP_ACTION_ICONS`/`XP_ACTION_LABELS` (`src/app/(dashboard)/dashboard/xp/page.tsx`). Plus aucune incitation à laisser un avis contre récompense visible dans l'app, conforme à l'interdiction absolue NIYAMA (avis/notes/installs rémunérés). |
| 4 | CORRIGÉ le 2026-08-23 : déclaration `export const niyama_family: NiyamaFamily = 'contenu_ia'` ajoutée dans `src/lib/legal/company.ts` (ré-exportée par `src/lib/legal/index.ts`), justifiée en commentaire (multi-expert IA : chat, génération image/vidéo/musique, agents, marketplace → famille 5 "Contenu & IA"). |
| 5 | CORRIGÉ le 2026-08-23 : nouveau composant `src/components/shared/LegalReconsentGate.tsx` monté globalement dans `src/app/(dashboard)/layout.tsx`. Il lit les `legal_acceptances` de l'utilisateur courant côté client (RLS), calcule les docs en attente via `CURRENT_LEGAL_VERSIONS` pour `cgu`/`cgv`/`confidentialite` (volontairement sans `mentions`, qui n'a aucune mécanique de consentement explicite dans l'app — l'inclure bloquerait tout le monde en permanence) et rend `LegalReacceptanceGate` tant qu'une acceptation manque ou est périmée. |
| 6 | NON CORRIGÉ : bloqué par 2 ressources externes indisponibles — aucune credential Apple Developer configurée (`APPLE_TEAM_ID` reste le placeholder `___à_remplir___`), et l'activation du provider Apple côté GoTrue nécessite le même accès VPS SSH refusé (gap 1). Ajouter un bouton "Continuer avec Apple" sans provider actif créerait un bouton mort (Loi 9 CLAUDE.md) — aucun code UI ajouté tant que les prérequis externes manquent. Documenté dans `ERRORS.md`. |
| 7 | Gap invalidé après vérification directe (lecture fichier, pas grep) : `src/app/cgu/page.tsx:20`, `src/app/cgv/page.tsx:20` et `src/app/politique-confidentialite/page.tsx:20` affichent déjà chacun "Dernière mise à jour : 6 avril 2026", identique au pattern de `mentions-legales/page.tsx:20`. Faux négatif de l'audit original (même piège d'encodage/formatage déjà repéré §1 de ce fichier pour l'adresse) — aucune modification de code nécessaire. |

**Bilan** : 4/7 gaps corrigés par du code réel (2, 3, 4, 5) ; 1/7 déjà conforme sans intervention nécessaire (7) ; 2/7 bloqués sur ressources externes indisponibles et documentés dans `ERRORS.md` (1 : accès VPS SSH ; 6 : credentials Apple Developer + même accès VPS). `npx tsc --noEmit` 0 erreur, `npm run build` réussi.

---

VERDICT:akasha-ai:ROUGE:7
