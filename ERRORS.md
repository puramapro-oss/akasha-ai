# ERRORS.md — AKASHA AI

Format : `|DATE|BUG|CAUSE|FIX|`

| DATE | BUG | CAUSE | FIX |
|---|---|---|---|
| 2026-08-23 | Mentions légales affichaient l'ancienne adresse Vercel (340 S Lemon Ave, Walnut, CA 91789) | Adresse jamais re-vérifiée depuis la rédaction initiale — Vercel a déménagé (pitfall documenté PIEGES.md §16, vérifié en direct 2026-08-23) | Adresse corrigée dans `src/app/mentions-legales/page.tsx` : 440 N Barranca Avenue #4133, Covina, CA 91723 |
| 2026-08-23 | Migration SQL du socle légal (`migrations/20260823_legal_core.sql`, tables `legal_acceptances`/`cookie_consents`/`account_deletion_requests` sur le schéma `akasha_ai`) non exécutée | Connexion SSH au VPS (`root@72.62.191.111`) refusée (`Connection refused`) après une tentative de connexion avec un mot de passe SSH obsolète trouvé dans un doc archivé (`docs/superpowers/plans/2026-04-06-akasha-phase1-foundations.md`) — probable ban fail2ban temporaire, ou service SSH indisponible pour une autre raison | À relancer une fois l'accès SSH restauré : `sed 's/__SCHEMA__/akasha_ai/g' packages/legal/sql/001_legal_core.sql` (déjà fait → `migrations/20260823_legal_core.sql`) puis `sshpass -p "$VPS_SSH_PASSWORD" ssh root@72.62.191.111 "PGPASSWORD='$POSTGRES_PASSWORD' psql -h localhost -p 5432 -U postgres -d postgres -f /dev/stdin" < migrations/20260823_legal_core.sql`. Pas d'impact sur `tsc`/`build` (pas de types Supabase générés dans cette app — `supabase.from('legal_acceptances')` etc. reste non typé, donc pas d'erreur de compilation en attendant) |

## Décisions socle légal NIYAMA (2026-08-23)

- **Pages `mentions-legales`/`cgu`/`cgv`/`politique-confidentialite` NON régénérées via `buildX(config, env)` du socle** : conservées telles quelles (contenu réel, spécifique à AKASHA — vrais plans/prix dans les CGV, vraie liste de sous-traitants dans la politique de confidentialité, datées du 6 avril 2026). Seule l'adresse Vercel obsolète a été corrigée (cf ligne ci-dessus). `src/lib/legal/content/*.ts` et `src/lib/legal/components/LegalPage.tsx` sont copiés (socle en bloc) mais non utilisés — disponibles si une regénération complète est décidée plus tard.
- **`CookieConsentBanner` du socle NON installé** : `src/components/shared/CookieBanner.tsx` existant est déjà fonctionnel (accepter/refuser, localStorage, déjà monté dans `layout.tsx`) — pitfall documenté PIEGES.md §16 "ne pas remplacer un bandeau qui fonctionne". Le hook `useCookieConsent`/`CookieConsentBanner` du socle restent copiés mais non montés. Ajouté en revanche : synchronisation serveur du choix (`POST /api/legal/cookie-consent`) depuis le bandeau existant, pour garder une preuve indépendante du navigateur côté utilisateurs connectés.
- **`aPaiement: true`** (Stripe checkout/webhook/portal/connect réels) → CGV conservées + `LegalAcceptanceNotice` avec `cgvHref="/cgv"`.
- **`aChatIA: true`** (chat principal `dashboard/chat` + assistant SAV `aide/page.tsx`, tous deux appellent Claude réellement) → `AIDisclosure` ajouté sur les deux interfaces.
- **Signup** : case à cocher CGU remplacée par `LegalAcceptanceNotice` zéro-case-à-cocher (cf CLAUDE.md §9.5) ; acceptation CGU/CGV/politique enregistrée côté serveur (`POST /api/legal/accept`) juste après la création de compte.
- **Boutons "Supprimer mon compte"/"Exporter mes données" de `dashboard/settings`** (jusqu'ici factices : mailto support, toast sans effet) redirigés vers la nouvelle page `dashboard/memoire` qui utilise le vrai flux RGPD (`MaMemoirePage`/`AccountDeletionButton` du socle, adaptés aux tokens de design AKASHA).

