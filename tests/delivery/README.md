# Réception des confirmations et récompenses — 22 novembre 2026

## Périmètre

Ce lot prolonge la PR 6 de `puramapro-oss/akasha-ai`, branche `fix/akasha-dependency-security-20261122`. L'arbre de départ est `2fe4aa54c4641ef560be946b16410c11dab80806`, commun à la tête distante `110b31dc9ac2ddefc911b0f84e561e08bca88811` et au commit local `e56aaa524c363728c90799f225b6fd9b799835d3`. Aucun manifeste de dépendance ni migration historique n'est réécrit.

Le cron applique les préférences enregistrées et la pause. Il distingue les refus du fournisseur, les erreurs de lecture et les échecs de confirmation. Une acceptation Resend n'établit pas une remise en boîte. La clé d'idempotence Resend protège ses reprises pendant la durée de conservation du fournisseur ; le journal SQL persiste la confirmation, sans promettre une transaction distribuée permanente.

Le partage conserve les règles existantes : trois demandes par jour UTC, 400 points pour la première puis 300. Le serveur authentifié décide du montant ; partage, mouvement et solde sont indivisibles. Une demande de suivi ne prouve pas la publication sur une plateforme externe. L'interface vérifie le reçu avant d'annoncer le crédit et conserve l'identifiant lors d'une réponse perdue.

Les treize références et prix de la boutique restent ceux du catalogue existant. Les seuls échanges disponibles sont :

| Référence | Prix existant | Remise transactionnelle |
| --- | ---: | --- |
| `credits-10` | 2 000 points | Ajout de 10 crédits au profil |
| `credits-50` | 8 000 points | Ajout de 50 crédits au profil |
| `ticket-1` | 500 points | Ticket pour un tirage existant, futur et `upcoming` |

Les dix autres références restent visibles mais indisponibles : aucune souscription, réduction ou sortie d'argent n'est simulée. Sans tirage éligible, aucun point n'est débité. Prix, identité, reçu d'achat et effet sont vérifiés côté serveur. L'ancienne fonction qui ne faisait que débiter est fermée. Une requête conservée peut être vérifiée malgré un solde épuisé ; le partage permet aussi cette vérification au plafond sans rouvrir la plateforme.

Le cadeau quotidien réunit la réservation et la remise des points, crédits ou ticket. Les crédits et points s'additionnent sous le même verrou de profil que les partages et achats. Les cadeaux historiques sans reçu exploitable demandent une réconciliation explicite, sans être attribués une deuxième fois. Un coupon reste `pending_coupon_activation`, avec référence et durée future, `fulfilled_at` et expiration nuls ; l'API retourne 202 et l'interface explique l'attente d'activation réelle.

Les clients peuvent encore modifier leurs réglages, leur présentation et leur onboarding. Ils ne peuvent plus modifier directement rôle, abonnement, crédits ou registre de récompenses. Le rôle de service et le provisioning conservent leurs usages privilégiés.

## Vérifications reçues

| Gate | Résultat | Portée |
| --- | --- | --- |
| Régressions sur le code de départ | 19 échecs attendus | Cron et deux écritures de partage ; même fixture corrigée que dans le candidat |
| Régressions de reprise UI | 2 échecs avant correction | Solde nul après achat commis ; troisième partage après réponse perdue |
| Suite applicative finale | **813/813 PASS, 47 fichiers** | API simulées, SDK contrôlé, DOM, PGlite ; aucun fournisseur réel |
| Types Next et TypeScript complet | **PASS** | Ensemble de l'application après les corrections de reprise |
| Lint global | **0 erreur, 4 avertissements** | Avertissements Next de navigation préexistants, hors fichiers corrigés |
| PostgreSQL 17.12 natif | **18/18 PASS** | Connexions indépendantes, attentes de verrou observées, rollback et droits |
| Identité des entrées SQL après les dernières modifications UI | **PASS** | Sept empreintes inchangées ; pas une deuxième exécution SQL |
| Build local final | **BLOQUÉ en préparation** | Disque saturé avant lancement ; CSS du cache public absents en fichiers. Onze fontes WOFF2 vérifiées ne suffisent pas à qualifier ce build |
| Quatre parcours Playwright Cycles | **BLOQUÉ** | Refus du socket Chromium déjà constaté dans cet environnement ; pas de répétition inutile |
| Fournisseurs, migrations et production | **NON TESTÉ** | Pas de compte réel, paiement, envoi email, application distante ou déploiement |

Les 18 cas natifs couvrent notamment la concurrence de deux premiers partages, le plafond quotidien, un rejeu de partage, un rejeu d'achat, deux achats concurrents, l'addition partage/cadeau et cadeau/achat, un rejeu de cadeau, les écritures refusées et les erreurs injectées. Les assertions vérifient les trois états du partage : ligne, journal et solde. Le test de journal de cadeau prouve le rollback du claim et des points ; la reprise quotidienne est exercée séparément.

Le banc extrait les définitions des tables concernées de `schema.sql`, crée ses propres rôles et politiques historiques synthétiques puis applique les quatre migrations. Il ne rejoue pas toutes les extensions, politiques ou données d'un projet Supabase distant. Il vérifie le chemin du cluster et son propriétaire avant d'écrire. Le rapport confirme l'arrêt du serveur, la suppression du cluster et l'absence du listener.

## Commandes reproductibles

Depuis le dossier de l'application, avec les dépendances du verrou installées :

```sh
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js --config eslint.config.mjs src tests/delivery/native.test.mjs
python3 tests/delivery/run-native.py --output /chemin/neuf/akasha-delivery --port 43047
```

Le répertoire de sortie natif doit être neuf. Si PostgreSQL n'est pas sur le chemin standard, ajouter `--pg-bin /chemin/postgresql/bin`. Le lanceur choisit uniquement `127.0.0.1`, refuse un port occupé et ne reçoit aucune URL de base distante. Il faut un espace disque libre suffisant et un compte local autorisé à lancer `initdb` ; ne pas utiliser une base existante.

La CI ajoute ce gate après les contrôles SQL Stripe et Entraide existants. Le build utilise la configuration fournisseur synthétique déjà définie par le workflow. Une CI exécutée ultérieurement doit être attribuée à son SHA exact et ne transforme pas rétrospectivement le build local bloqué en réussite.

## Coordination des migrations, routes et clients

Le banc natif a appliqué les fichiers nouveaux dans cet ordre :

1. `20261122_delivery_consistency.sql` : RPC partage et confirmation email, restrictions du registre.
2. `20261122_daily_gift_delivery.sql` : réservation et remise quotidiennes, état explicite des coupons.
3. `20261122_points_redemption_authority.sql` : remise de boutique, reçu d'achat et fermeture de l'ancien débit seul.
4. `20261122_profile_write_boundary.sql` : réglages du profil autorisés par colonne, champs privilégiés fermés.

Ces migrations supposent les tables et types historiques du projet. Faire correspondre cet ensemble avec l'état réel du schéma et son historique avant application ; les noms datés du dépôt, dont plusieurs partagent déjà un préfixe, ne certifient pas un historique Supabase CLI directement rejouable. Aucun renommage ni effacement de migration historique n'est effectué ici.

Les nouveaux handlers et clients exigent les nouveaux RPC et colonnes : les mettre en service avant les migrations produit des erreurs. Inversement, les migrations révoquent les anciennes écritures directes et remplacent les fonctions historiques ; de vieux onglets partage peuvent alors échouer et une ancienne route de cadeau ou d'achat n'est pas un consommateur compatible. Ce lot ne fournit donc pas une procédure de bascule sans interruption.

Préparer une fenêtre contrôlée pour les mutations concernées, appliquer le lot SQL sur l'état vérifié, publier ensemble les routes et interfaces correspondantes puis faire recharger les clients avant reprise. Exécuter la recette du reçu, du rejeu et des permissions dans cet environnement avant de rouvrir ces actions. L'ancien client partage pouvait ignorer un refus de sa propre écriture : son rafraîchissement est nécessaire pour bénéficier des messages corrigés.

Ne pas restaurer isolément une ancienne route après application du schéma. Une remise déjà journalisée doit être rapprochée de son reçu, sans crédit compensatoire automatique. Les cadeaux historiques ambigus et coupons en attente restent visibles pour une réconciliation ou activation séparée ; aucun traitement fournisseur de ces éléments n'est livré par ce lot.

Les limites plus larges de portefeuille/retrait, espace et membre, missions et signalements restent celles décrites dans `ERRORS.md`. Ce lot ne revendique pas leur atomicité ni des performances réelles sous charge.
