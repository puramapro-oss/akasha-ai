# Réception des confirmations et récompenses — 22 novembre 2026

## État de la troisième consolidation et de sa récupération

La base publiée est `ca2eeecb83a2694ac475d8f6cd9f2f1912603c1a`.
Sa [CI 45054457922](https://github.com/puramapro-oss/akasha-ai/actions/runs/45054457922)
a reçu 961 tests, 20 cas natifs DELIVERY avec 12 témoins de verrou,
37 cas de frontières, cinq cas Chromium de confirmation et quatre cas Cycles.
Ces résultats appartiennent à cette révision amont.

Avant la perte de l'environnement local, le candidat consolidé avait reçu
**165 assertions ciblées : 47 de composition, dont les 37 frontières, et
118 pour le cadeau quotidien et la boutique**. Son arbre indexé était
`cdd441fab54ec66420a0cd7bd7f5bacb4979e847`. Le passage global suivant a été
interrompu avec le code 137 ; il ne constitue pas une réception globale.

La récupération utilise le checkpoint sauvegardé
`c7e3aeb79318112a336d3361a7244a7d3dcebc28` et l'amont exact.
Les deux suites SQL cadeau/boutique retrouvent leurs empreintes gelées.
Les fixtures, le runner des frontières, les trois cas SQL adaptés et la suite
de composition sont reconstruits à partir des sources versionnées et de leur
contrat conservé. **Les 165 PASS antérieurs ne sont pas réattribués à ces
reconstructions. Une CI sur le nouvel arbre est requise.**

Le banc DELIVERY charge `schema.sql` entier, le DDL partagé attesté
`tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql`, les deux
préalables de septembre et les neuf migrations dans l'ordre documenté dans
[le banc des frontières](../reward-boundaries/README.md).
Cela représente **13 sources SQL**. Le manifeste ajoute le runner, le fixture
et la suite native, soit **16 fichiers** empreintés.

Le contrat courant exige **21 cas natifs et 12 témoins de verrou**, sans
échec, omission ni annulation. Il conserve le claim durable d'email, la
révocation de l'ancien recorder et les logs historiques. Les clients et
processus propres au banc sont fermés même lors d'une interruption.
Le schéma, les sources cadeau/API et les fichiers Cycles restent ceux de
l'amont ; les quatre migrations publiées et l'extension ne changent pas.

**NON TESTÉ sur la reconstruction : PGlite, tests React, TypeScript/ESLint,
build, PostgreSQL natif et Chromium.** Aucun environnement de remplacement,
serveur local, navigateur ou fournisseur réel n'a été lancé. La CI normale
autorisée reçoit le nouveau commit exact.

Les sections qui suivent conservent l'historique des lots précédents ; leurs
comptages et limites ne constituent pas une qualification de la reconstruction.

## Périmètre

Ce lot prolonge la PR 6 de `puramapro-oss/akasha-ai`, branche `fix/akasha-dependency-security-20261122`. L'arbre de départ est `2fe4aa54c4641ef560be946b16410c11dab80806`, commun à la tête distante `110b31dc9ac2ddefc911b0f84e561e08bca88811` et au commit local `e56aaa524c363728c90799f225b6fd9b799835d3`. Aucun manifeste de dépendance ni migration historique n'est réécrit.

Le cron applique les préférences enregistrées et la pause. Il distingue les refus du fournisseur, les erreurs de lecture et les échecs de confirmation. Une acceptation Resend n'établit pas une remise en boîte. La clé d'idempotence Resend protège ses reprises pendant la durée de conservation du fournisseur ; le journal SQL persiste la confirmation, sans promettre une transaction distribuée permanente.

La consolidation suivante part de la tête publiée `4123b25b80b0105003a6e71f61322565ea034633`, arbre `921f7bb4a0a30272b153873b064fb2e5749b5377`. Elle conserve les travaux publiés en parallèle : mêmes quatre migrations non déployées, mêmes RPC et mêmes trois articles disponibles. Elle n'introduit aucune migration concurrente ni seconde suite native pour ces récompenses.

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

## Vérifications historiques du lot reçu à `4123b25`

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

## Vérifications historiques du lot publié à `78a4b9d`

Le récit ci-dessous est conservé avec son état avant publication ; la réussite
CI observée ensuite est indiquée en tête de ce document. Le cron actuel emploie
le journal durable décrit dans le guide général, et non l'ancien recorder
booléen de ce récit historique.

Les écritures SQL contrôlent maintenant le contenu exact de leurs résultats `RETURNING`. Les triggers qui suppriment ou réécrivent une remise, son journal, son reçu ou son solde font échouer toute la transaction. Les permissions héritées de `PUBLIC`, y compris `TRUNCATE`, `REFERENCES`, `TRIGGER` et les anciens privilèges de colonnes du profil, sont fermées aux clients ; les douze champs de réglages et les écritures serveur restent autorisés. Les journées de récompense sont des fenêtres de 24 heures UTC.

Le RPC authentifié `get_social_share_stats()` calcule les statistiques complètes côté base, y compris au-delà de 1 100 lignes. Les demandes en attente gardent leurs clés historiques, sont persistées dans le stockage partagé du navigateur et protégées par Web Locks jusqu'à la confirmation. Une seconde vue ne peut pas créer une attribution concurrente pour la même action. Le stockage refusé ou l'absence de verrou produit une erreur explicite avant la nouvelle attribution. Une reprise reste possible au plafond quotidien ou après épuisement du solde, sans rouvrir la plateforme de partage. Le délai de la boutique couvre aussi la lecture du corps de réponse.

Le cron parcourt ses cohortes par `(created_at, id)` sans offset, avec anti-jointure des confirmations, conservation des microsecondes et contrôle de l'ordre. Seule une page vide établit la fin. Il conserve les préférences, la clé Resend et les octets des modèles reçus ; il relit le reçu exact après chacune des deux réponses booléennes du RPC. Son budget limite les nouvelles opérations à 45 secondes et 75 tentatives fournisseur, espacées de 550 ms, puis retourne un résultat partiel récupérable ; ce budget ne garantit pas l'annulation d'une requête réseau déjà engagée. Une relance reste limitée à la cohorte du jour UTC, sans rattrapage des jours précédents.

Le contact vérifie l'identité et le contenu de la ligne enregistrée puis les acceptations fournisseur. Lorsque le message est durablement reçu mais qu'une notification échoue, l'interface annonce cet état partiel et évite une nouvelle soumission. Un échec de réception conserve le brouillon.

| Contrôle du candidat consolidé avant publication | Résultat |
| --- | --- |
| Régressions SQL avant correction | **67 échecs reproduits sur 124 tests** |
| SQL après correction et cinq cas supplémentaires | **129/129 PASS** — inclus dans la suite intégrée |
| Suite applicative intégrée | **925/925 PASS, 50 fichiers**, zéro échec, ignoré ou todo ; 58,97 s |
| Revue indépendante clients et compatibilité native | **PASS de revue statique**, sans substitution à l'exécution |
| Types et lint | Types complets PASS ; lint sans erreur, quatre avertissements Next préexistants |
| PostgreSQL natif consolidé | **Réception CI attendue** : 20 cas et 12 témoins de verrouillage |
| Chromium entre deux onglets | **Réception CI attendue** : cinq scénarios du helper exact |
| Build final et production | Build attendu dans la CI ; aucune migration ni livraison en production |

Le total de 925 comprend les tests SQL, email et interface ; leurs sous-totaux ne s'y additionnent pas. Le candidat local antérieur de 940 tests a été remplacé par cette consolidation et n'est pas la source à publier. La CI de la base `4123b25` a réussi ses 813 tests et son build ; elle ne qualifie pas les nouveaux changements.

La suite native conserve les 18 cas reçus et ajoute deux ordres de concurrence manquants : partage puis cadeau de points, et modification du profil puis cadeau de crédits. Les douze courses exigent des PID distincts et une observation de `pg_blocking_pids` contenant le premier avant son commit. Le lanceur vérifie exactement 20 réussites, aucun cas ignoré, douze observations, les empreintes d'entrée et le nettoyage du cluster.

Le test Chromium charge le fichier `src/lib/idempotency/browser-request.ts` du candidat dans deux onglets de même origine. Il exerce exclusion mutuelle, réponse perdue, rechargement, confirmation d'une autre clé et confirmation correspondante. Il vérifie les versions, l'absence de requête extérieure et le nettoyage navigateur/serveur. Il ne teste pas les pages Next complètes, la base distante ou les fournisseurs. Les résultats de la prochaine CI doivent être lus sur son SHA exact dans la PR 6.

## Commandes reproductibles

Depuis le dossier de l'application, avec les dépendances du verrou installées :

```sh
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js --config eslint.config.mjs src tests/delivery/*.mjs
python3 tests/delivery/run-native.py --output /chemin/neuf/akasha-delivery --port 43047
node node_modules/playwright/cli.js install --with-deps chromium
node tests/delivery/pending-browser.cjs
```

Le répertoire de sortie natif doit être neuf. Si PostgreSQL n'est pas sur le chemin standard, ajouter `--pg-bin /chemin/postgresql/bin`. Le lanceur choisit uniquement `127.0.0.1`, refuse un port occupé et ne reçoit aucune URL de base distante. Il faut un espace disque libre suffisant et un compte local autorisé à lancer `initdb` ; ne pas utiliser une base existante.

La CI ajoute ce gate après les contrôles SQL Stripe et Entraide existants. Le build utilise la configuration fournisseur synthétique déjà définie par le workflow. Une CI exécutée ultérieurement doit être attribuée à son SHA exact et ne transforme pas rétrospectivement le build local bloqué en réussite.

## Coordination des migrations, routes et clients

Le banc natif historique avait appliqué les fichiers, sous leurs anciens noms,
dans cet ordre :

1. `20261122_delivery_consistency.sql` : RPC partage et confirmation email, restrictions du registre.
2. `20261122_daily_gift_delivery.sql` : réservation et remise quotidiennes, état explicite des coupons.
3. `20261122_points_redemption_authority.sql` : remise de boutique, reçu d'achat et fermeture de l'ancien débit seul.
4. `20261122_profile_write_boundary.sql` : réglages du profil autorisés par colonne, champs privilégiés fermés.

Ces migrations supposent les tables et types historiques du projet. Faire correspondre cet ensemble avec l'état réel du schéma et son historique avant application ; les noms datés du dépôt, dont plusieurs partagent déjà un préfixe, ne certifient pas un historique Supabase CLI directement rejouable. Aucun renommage ni effacement de migration historique n'est effectué ici.

Les nouveaux handlers et clients exigent les nouveaux RPC et colonnes : les mettre en service avant les migrations produit des erreurs. Inversement, les migrations révoquent les anciennes écritures directes et remplacent les fonctions historiques ; de vieux onglets partage peuvent alors échouer et une ancienne route de cadeau ou d'achat n'est pas un consommateur compatible. Ce lot ne fournit donc pas une procédure de bascule sans interruption.

Préparer une fenêtre contrôlée pour les mutations concernées, appliquer le lot SQL sur l'état vérifié, publier ensemble les routes et interfaces correspondantes puis faire recharger les clients avant reprise. Exécuter la recette du reçu, du rejeu et des permissions dans cet environnement avant de rouvrir ces actions. L'ancien client partage pouvait ignorer un refus de sa propre écriture : son rafraîchissement est nécessaire pour bénéficier des messages corrigés.

Ne pas restaurer isolément une ancienne route après application du schéma. Une remise déjà journalisée doit être rapprochée de son reçu, sans crédit compensatoire automatique. Les cadeaux historiques ambigus et coupons en attente restent visibles pour une réconciliation ou activation séparée ; aucun traitement fournisseur de ces éléments n'est livré par ce lot.

Pour ce lot historique, les limites plus larges de portefeuille/retrait, espace
et membre, missions et signalements étaient celles décrites dans `ERRORS.md`.
Les corrections de retrait ajoutées depuis ont leur propre qualification dans
`tests/withdrawal-idempotency/README.md`. Aucun de ces résultats ne constitue
une mesure des performances réelles sous charge.

## Extension des frontières après `78a4b9da`

La réconciliation suivante conserve les quatre migrations publiées à
`78a4b9da9e63686d6956da9e643395e3be4b2e4e` octet pour octet et ajoute
`20261123010000_reward_boundaries.sql`. Les RPC de livraison, leurs contrôles
`RETURNING`, les coupons en attente, les prix et `get_social_share_stats()` restent
inchangés. Le nouveau wrapper de partage vérifie seulement l’identité attendue
avant de déléguer au RPC existant.

Les fixtures PGlite et native chargent maintenant `schema.sql` **entier**, les
deux migrations historiques de claim/débit, les quatre migrations publiées, cette extension, puis les quatre overlays
durables de retrait, email, partage et export. La description antérieure de tables extraites correspond au
banc reçu avant cette réconciliation. Les vingt cas natifs amont et leurs douze
témoins de verrouillage sont conservés. Le contrat consolidé compte vingt et un
cas, avec le recorder email révoqué et le claim durable ; aucune nouvelle exécution
multisession locale n’est revendiquée.

L’extension ferme les entrées de profil/série et les écritures obtenues par
héritage, vérifie les prérequis structurels et refuse une révision ancienne ou
inconnue des fonctions publiées. Le même nom de migration existait à `4123b25`
avec des corps différents : vérifier l’historique et le contenu effectif des RPC
avant application. Aucune fonction trouvée n’est écrasée automatiquement.

Le [banc des frontières](../reward-boundaries/README.md) documente les contrôles
complémentaires de rôles/RLS et leurs contre-épreuves sur PostgreSQL natif sans
socket. Il ne remplace ni les 129 contrôles SQL publiés, ni les vingt courses du
banc de livraison, ni la réception sur une base réellement déployée.


## Complément marketplace et navigation après `ca2eeec`

La base `ca2eeecb83a2694ac475d8f6cd9f2f1912603c1a` est reçue par la
[CI 45054457922](https://github.com/puramapro-oss/akasha-ai/actions/runs/45054457922) :
961 tests applicatifs, 20 cas natifs de livraison, 37 cas natifs de frontières,
cinq contrôles Chromium du helper et quatre parcours publics Next, types, lint
et build réussis. Les mentions « attendu » des sections historiques ci-dessus
décrivent leur état avant cette réception ; elles ne sont pas l'état courant
de cette base.

Le complément traite les confirmations de publication et d'installation de la
marketplace. Une ligne retournée doit correspondre à l'agent, à son propriétaire
ou utilisateur et, pour une publication, à la visibilité demandée. La publication
conditionne également l'écriture sur la visibilité lue. Une erreur, une absence
de reçu ou un reçu incohérent n'annonce plus un succès. Les doubles soumissions
sont bloquées dans la vue ; délai, fermeture, démontage et changement de compte
retirent les callbacks devenus obsolètes. Une annulation cliente ne garantit pas
l'annulation d'une écriture déjà engagée côté serveur : recharger la liste permet
d'en recevoir l'état.

Les lectures privées réutilisent `useAsyncResource`, chargent seulement la
fenêtre ouverte et masquent immédiatement l'ancien compte. Les erreurs publiques
et privées proposent une reprise, sans devenir une fausse collection vide.
Le tri public utilise `agents.installs`, colonne du schéma canonique, avec
l'alias de présentation `installs_count`. Une installation confirmée relit les
valeurs stockées ; rejouer un upsert ne fabrique plus une installation
supplémentaire dans l'interface. Ce complément ne crée pas de synchronisation
globale du compteur, de nouveau catalogue payant ou de règlement fournisseur.

La navigation vers Agents, les tarifs et la gestion Connect utilise le routeur
Next. La déconnexion conserve son rechargement complet et son avertissement de
lint tant que la purge de l'état privé par une navigation douce n'est pas
qualifiée. Aucune règle ESLint n'est supprimée ou désactivée.

### Preuve comparative et nouveaux contrôles

`marketplace-baseline.json` conserve trois observations du corps exact du
handler historique, exécuté en V8 avec transport, notifications et setters
contrôlés : deux exigences échouent (faux succès sans reçu ; rejet réseau laissant
le chargement actif), tandis que l'erreur SQL retournée est déjà gérée. Seules
les deux annotations TypeScript des paramètres ont été retirées pour cette
exécution ; elle ne qualifie pas React, Supabase, le DOM ou un fournisseur.

`src/app/(dashboard)/dashboard/marketplace/marketplace-delivery.test.tsx`
exécute les composants et hooks du candidat sous React/jsdom avec Supabase et
notifications contrôlés. Il couvre les reçus absents ou incohérents, les erreurs,
reprises, délais, doubles clics, fermeture, changements d'acteur, lectures et
rejeux d'installation. Ces scénarios sont inclus automatiquement par la suite
`npm test` existante. Les types, lint, build et gates PostgreSQL/Chromium
restent ceux du workflow existant, sans réduction ni retrait.

L'environnement local a été indisponible pendant la préparation initiale, puis
est redevenu accessible. Les résultats locaux et ceux de la CI doivent être
attribués à la composition effectivement exécutée et au SHA publié dans la PR.
Les pages authentifiées complètes, la base déployée et les fournisseurs restent
des contrôles distincts.


### Identité de l'intention d'achat

La boutique joint maintenant `expected_user_id` à sa demande. La route exige
cet UUID et le compare à l'utilisateur authentifié avant toute création du client
privilégié ou appel de remise : une intention d'un autre compte retourne 409.
Le reçu contient `user_id`, que la page compare aussi avant succès, modification
du solde ou clôture de l'identifiant de reprise. Six scénarios API/DOM complètent
les tests existants. La page et la route doivent être publiées ensemble ; la
recherche des consommateurs accessibles n'a pas révélé de client mobile de
cet endpoint. Les RPC, migrations et prix restent inchangés.

### Vérification locale du lot marketplace et identité d’achat

Après rétablissement de l’exécution locale, le lot combiné a passé **79/79 tests ciblés** :
23 marketplace, 41 API de conversion de points, 7 livraisons boutique et 8 confirmations
sans reçu. TypeScript (`tsc --noEmit --incremental false`) passe. ESLint signale
**0 erreur et 1 avertissement préexistant** dans `useAuth.ts`, pour la navigation de
fin de session ; aucune règle n’a été désactivée. `git diff --check` passe.
Ces vérifications ne remplacent pas la CI complète du commit publié, ni une validation
du service en production avec ses dépendances réelles.
