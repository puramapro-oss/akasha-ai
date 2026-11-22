# Qualification du suivi des partages AKASHA

Le suivi confirme une intention de partage ou une remise à l’interface de l’appareil. Il ne démontre ni une publication sur un réseau social ni sa réception par un tiers. Les points restent ceux du parcours existant : 400 pour la première participation de la journée UTC, puis 300 et 300, au maximum trois.

## Contrat atomique

La migration `20261122170200_social_share_tracking_atomic.sql` remplace l’implémentation entrante de `record_social_share(p_request_id uuid, p_share_code text, p_platform_hint text)` et conserve le contrat entrant `get_social_share_stats()` au schéma `akasha_ai`. `request_id` reste la seule identité de demande. L’entrée concurrente `track_social_share` et la surcharge inutilisée `get_social_share_stats(uuid)` sont supprimées. Le seul RPC de statistiques renvoie une enveloppe `version=1` et `user_id=auth.uid()` ; le client valide les deux avant de présenter les totaux.

Le bénéficiaire provient exclusivement de `auth.uid()`. Le RPC verrouille son profil, calcule le quota et les points côté serveur, puis écrit `point_transactions`, `social_shares` et le solde dépensable `purama_points` dans une transaction. Les remises de cadeau et les achats boutique prennent le même premier verrou de profil ; leur composition ne perd pas les crédits ni les débits. Le RPC de statistiques compte l’historique complet, sans dépendre de la pagination REST. Les journées sont bornées en UTC et durent exactement 24 heures, quelle que soit la zone de la session SQL.

Une répétition de la même demande retourne les identifiants existants sans octroi supplémentaire, même au plafond ou après un achat ayant consommé des points. Le reçu conserve les champs entrants `user_id`, `request_id`, `share_id`, `points`, `today_shares`, `replayed` et ajoute `transaction_id`, `share_code`, `platform_id`, `shared_at`. Des paramètres différents pour le même UUID sont refusés. La fermeture entrante des écritures directes protège tous les types de points et le solde, pas seulement les partages.

Avant de retourner un reçu, la transaction relit les trois lignes après toutes les écritures et leurs déclencheurs. Leur contenu doit correspondre exactement aux valeurs validées. Une insertion ignorée, une suppression ou une réécriture silencieuse entraîne un refus `55000` et un retour arrière de la transaction entière. La qualification couvre aussi les déclencheurs du dernier effet, le solde, qui altèrent les journaux écrits plus tôt.

Les reçus entrants portant déjà `request_id` sont repris grâce à leur unique transaction `source=share/<share_id>`, sans réécrire l’historique ni créditer de nouveau. Une transaction absente, ambiguë ou incompatible, ou un compte de points non attesté, reste un refus explicite ; aucun crédit réparateur n’est inventé. Les anciennes lignes sans identité restent conservées et comptées dans les statistiques.

Les fixtures chargent les quatre migrations entrantes de livraison, cadeau, boutique et frontière de profil, puis les consolidations EMAIL et PARTAGE. Le recorder email historique n’est plus exécutable, même par le rôle service ; les journaux entrants ne sont pas promus en confirmations fournisseur. La suite email dédiée qualifie le protocole durable qui le remplace.

## Interface et récupération

Le navigateur ouvre une page vide pendant le geste utilisateur. Il vérifie l’existence de la fenêtre avant d’enlever son `opener`, de régler la politique de referrer et de demander la navigation. Une création de fenêtre refusée ne déclenche pas le suivi. L’absence de Web Share conserve la copie du lien sans récompense. Une annulation native est distinguée d’un refus de suivi après remise à l’appareil.

L’opération est conservée et relue dans `localStorage` avant sa soumission. Les anciens reçus de `sessionStorage` sont importés avec leur UUID exact. Le helper `browser-request.ts` reste identique à l’amont qualifié ; ses verrous Web Locks restent tenus jusqu’au reçu et au nettoyage, avec un verrou de compte protégeant le reçu riche et le verrou canonique de plateforme. L’ouverture de la popup ou l’appel natif précède toute attente de verrou afin de conserver le geste utilisateur. Un refus de verrou ne soumet aucun crédit. Une réponse perdue, un délai ou une interruption de session restent des résultats incertains : la vérification explicite réutilise la même clé et n’ouvre pas de nouvelle fenêtre. Les clés de reprise entrantes par plateforme sont également conservées et traitées l’une après l’autre, sans fabriquer de nouvel UUID. Le compte suivant ne récupère pas l’opération du précédent. La page interdit une nouvelle participation tant que la précédente reste incertaine. Si la conservation locale échoue, aucune écriture impossible à reprendre n’est lancée.

## Exécution reproductible

Depuis la racine du dépôt :

```bash
node tests/share-tracking/reproduce-baseline.mjs
node node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts src/lib/share/tracking.test.ts src/lib/share/useShareActions.test.tsx src/lib/share/delivery-sql.test.ts tests/share-tracking/atomic.test.ts src/components/share-delivery.test.tsx src/components/pending-confirmation.test.tsx src/components/async-lifecycle.test.tsx src/lib/daily-gift-sql.test.ts src/lib/points/redemption-sql.test.ts
node tests/share-tracking/popup-browser.mjs
```

La dernière commande utilise le Chromium Playwright installé normalement dans l’environnement de qualification. `SHARE_BROWSER_EXECUTABLE` permet de sélectionner explicitement un binaire déjà présent. Tous les documents sont synthétiques et servis par interception du contexte ; aucune connexion vers un réseau social n’est nécessaire. Trois scénarios sont prévus : ouverture réelle sur clic avec absence d’opener et de Referer, refus simulé de création de fenêtre, protocole de navigation interdit.

PGlite vérifie la transaction PostgreSQL dans un seul processus, les retours arrière, les rôles, les politiques, les répétitions et les données historiques. Il ne constitue pas une preuve de concurrence entre sessions PostgreSQL indépendantes. Cette preuve relève des campagnes natives distinctes `tests/notification-share-reliability/native/share.test.mjs` (13 scénarios préparés) et `tests/delivery/native.test.mjs` (campagne de composition cadeau/boutique maintenue par son propriétaire). Une validation syntaxique de ces fichiers ne vaut pas exécution de ces scénarios.

## Limites observées dans cet environnement

La première tentative Chromium locale s’est arrêtée avant la création du contexte avec `socket() failed: Operation not permitted`. Aucun scénario navigateur ni requête de cette tentative n’a été exécuté. Aucun autre lancement local, relèvement de permission, téléchargement ou changement de transport n’a été tenté après ce refus. Le rapport `evidence/popup-browser.json` conserve cette limitation. Une réception CI ultérieure doit être présentée séparément de ce résultat local.

Les tests d’interface exécutent les vrais hooks React avec des réponses de transport et des interfaces de partage simulées ; ils ne prouvent pas le comportement d’un appareil physique. Aucune migration de production et aucun partage, courriel ou paiement réels ne sont effectués.
