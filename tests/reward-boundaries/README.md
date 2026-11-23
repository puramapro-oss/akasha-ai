# Frontières d’écriture des récompenses — extension de la révision 78a

## Composition consolidée et récupération

La qualification courante porte sur le schéma entier et les neuf migrations
ci-dessous, après les deux préalables historiques
`20260926_daily_gift_atomic_claim.sql` et `20260926_points_redeem_atomic.sql`.
Les quatre premières migrations et l'extension conservent le SQL publié.

| Ordre | Migration |
| --- | --- |
| 1 | `20261122165000_delivery_consistency.sql` |
| 2 | `20261122165100_daily_gift_delivery.sql` |
| 3 | `20261122165200_points_redemption_authority.sql` |
| 4 | `20261122165300_profile_write_boundary.sql` |
| 5 | `20261123010000_reward_boundaries.sql` |
| 6 | `20261123010100_akasha_withdrawal_idempotency.sql` |
| 7 | `20261123010200_email_sequence_delivery.sql` |
| 8 | `20261123010300_social_share_tracking_atomic.sql` |
| 9 | `20261123010400_delivery_receipts_export.sql` |

Le DDL partagé de retrait est repris sans invention depuis
`tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql` avant l'overlay
de retrait. Le vrai trigger de création du profil et de la série provient de
`schema.sql`.

L'extension doit vérifier les empreintes des RPC publiés **avant** les overlays.
Elle réaccorde le recorder historique à `service_role` ; l'overlay email le
révoque ensuite au profit de claim/complete/reconcile. L'overlay partage remplace
le writer canonique, tout en conservant le wrapper qui vérifie l'acteur.
Réappliquer l'extension après ces overlays doit échouer avec **55000**, sans
écraser une fonction ni rétablir le recorder. Aucun MD5 publié n'est modifié.

Le runner conserve les contre-épreuves de révision inconnue, de rejeu et de
droits hérités sur les corps publiés, avant d'installer les overlays une seule
fois. Il applique ensuite les **37 cas de comportement à la composition finale**.
`composed-cases.sql` remplace explicitement trois cas de droits/email :
le recorder est fermé, le protocole durable confirme le reçu, les doublons
historiques restent sans nouvel envoi et les journaux privés restent fermés
aux clients. Le service conserve sa lecture explicitement autorisée du journal
d'email ; ses écritures passent par les RPC.

La suite `tests/notification-share-reliability/composition.test.ts` prépare
**47 cas** sur un moteur PGlite : ces 37 cas, les huit scénarios de composition
antérieurs et deux contrôles de l'acteur/ordre des empreintes. Le banc natif
DELIVERY reste distinct : **21 cas, 12 témoins de verrou**.

Le candidat local antérieur avait reçu les 47 cas PGlite, inclus dans ses
165 assertions ciblées, avant la perte de son environnement. La présente
récupération provient du checkpoint
`c7e3aeb79318112a336d3361a7244a7d3dcebc28` et de l'amont
`ca2eeecb83a2694ac475d8f6cd9f2f1912603c1a`.
La suite de composition et les trois cas adaptés sont reconstruits ; aucune
exécution n'est revendiquée sur leurs nouveaux octets. **NON TESTÉ : réception
de cette reconstruction, à obtenir dans la CI du nouveau commit.**

Les commandes et résultats des sections suivantes décrivent le banc amont et
son historique. Une exécution native, y compris `--single`, ou Chromium n'est
pas autorisée dans l'environnement local de cette récupération. Le workflow CI
autorisé est chargé de ces gates. Aucun fournisseur réel n'est appelé.

## Référence historique de l'extension amont

## Source et périmètre

Cette extension s’applique après les quatre migrations de livraison publiées dans
`puramapro-oss/akasha-ai` au commit
`78a4b9da9e63686d6956da9e643395e3be4b2e4e`, arbre
`6869a9d8ca0f3147d9cf302c54d1bf536f908420`.

Les quatre fichiers `20261122165000_delivery_consistency.sql`,
`20261122165100_daily_gift_delivery.sql`, `20261122165200_points_redemption_authority.sql` et
`20261122165300_profile_write_boundary.sql` restent inchangés. La migration ajoutée est
`20261123010000_reward_boundaries.sql`. Elle ne recrée aucun de leurs RPC et ne
modifie aucune donnée historique, aucun prix, aucune probabilité ni aucun état
de livraison. Les coupons restent en attente d’activation selon le contrat publié.

Les changements portent sur les droits et les entrées de récompense :

- Le profil reste modifiable par son propriétaire sur les douze champs existants
  de présentation, préférences et onboarding. Les champs d’autorité, de plan,
  d’identité serveur, de solde et de récompense restent réservés aux writers de
  confiance. Une colonne nouvelle n’entre pas implicitement dans cette liste.
- Les séries quotidiennes (`streaks`) deviennent consultables par leur
  propriétaire, sans écriture cliente. Le provisioning et les écritures serveur
  conservent leurs opérations.
- Les gardes `SECURITY INVOKER` vérifient le rôle SQL effectif. Un claim JWT qui
  prétend être `service_role` ne lui donne pas cette autorité. Les suppressions et
  `TRUNCATE` du profil sont contrôlés avant leurs effets en cascade.
- Les huit tables de reçus et registres conservent les lectures personnelles et
  les writers serveur. Les privilèges directs de table et de colonne sont
  révoqués aux rôles clients. Les gardes refusent aussi les écritures obtenues par
  un rôle hérité ou une politique permissive.
- Si un héritage extérieur conserve `TRIGGER`, `REFERENCES` de table ou de
  colonne, ou une exécution privilégiée interdite, la migration échoue
  explicitement. Elle ne révoque pas cet héritage et ne modifie aucun autre
  schéma ni privilège global.
- `record_social_share_checked(uuid,text,text,uuid)` vérifie l’identité attendue
  du client, puis délègue à `record_social_share(uuid,text,text)`. Le RPC existant,
  son reçu et `get_social_share_stats()` sont conservés.

## Prérequis de révision

Les mêmes noms de migration existaient au commit `4123b25` avec des corps de
fonctions antérieurs. Une entrée dans l’historique des migrations ne prouve donc
pas que les contrôles `RETURNING` de `78a4b9da` sont installés.

Avant toute modification, l’extension compare `md5(pg_proc.prosrc)` aux corps
exacts des quatre RPC de mutation et de `get_social_share_stats()` publiés à
`78a4b9da`. Une ancienne révision, une révision inconnue, une fonction absente ou
une surcharge de cadeau concurrente produit une erreur `55000`. Il s’agit d’un
identifiant de révision du texte stocké, pas d’une signature de confiance.

Pour une installation existante, vérifier son état réel et préparer une mise à
niveau revue des fonctions canoniques avant cette extension. Elle ne remplace
pas automatiquement les fonctions trouvées. Le jeu de tests rétablit notamment
le véritable ancien RPC email de `4123b25`, constate le refus, puis vérifie que
l’extension n’a changé ni ce corps ni l’historique. Une copie historique de vingt
lignes est réservée à cette fixture ; elle ne fait pas partie des migrations.

## Banc natif sans serveur réseau

Le lanceur crée un cluster synthétique neuf dans le répertoire temporaire local,
utilise `postgres --single -j`, conserve ses SQL, journaux et reçu hors du cluster,
puis supprime uniquement son propre cluster. Il ne lit aucune URL Supabase ou
PostgreSQL distante et n’appelle aucun fournisseur.

L’ordre exécuté est :

1. Rôles et `auth.users` synthétiques, puis `schema.sql` entier, avec ses triggers
   de création de profil et de série.
2. Les deux migrations historiques `20260926_daily_gift_atomic_claim.sql` et
   `20260926_points_redeem_atomic.sql`, avant les données de fixture.
3. Des anciens droits de colonne et politiques explicitement synthétiques, puis
   les quatre migrations publiées de `78a4b9da`.
4. Les données de fixture et la nouvelle extension.

Le mode autonome exige une calibration des OID ordinaires. Le premier contrôle
de permissions vérifie un utilisateur `NOSUPERUSER`, `NOBYPASSRLS`, une table
d’OID au moins 16384, RLS actif et la visibilité d’une seule ligne sur huit. Le
lanceur refuse de poursuivre si cette contre-épreuve échoue. Un code de sortie
zéro de PostgreSQL ne suffit jamais : chaque étape exige son marqueur et
l’absence d’erreur, ou exactement le refus attendu.

Les littéraux SQL dollar-quoted sont transportés sous forme de chaînes échappées
équivalentes pour éviter le séparateur de commandes des lignes vides de `-j`.
Leur valeur reste exacte, y compris les lignes vides du corps des fonctions. Les
empreintes `prosrc` et les comparaisons `pg_get_functiondef` le contrôlent en base.

### Résultat local de l’extension

Avec PostgreSQL **16.16**, l’extension d’empreinte SHA256
`8632f74e4a3b3718f15d2ddacfbcad1baaa7316cfb10c5d67d7ce39177a1f941`
a passé **37 cas comportementaux et 194 étapes**. Les étapes comprennent les
préparations et contre-épreuves ; elles ne représentent pas 194 tests métier.

| Vérification | Portée |
| --- | --- |
| 31 cas profil/série | Champs protégés, douze champs éditables, RLS, nouveaux champs, rôles hérités, provisioning et cascades serveur |
| 6 cas de composition | Droits RPC/registres, identité attendue du partage, confirmation email, lectures personnelles, écriture héritée et cadeau + partage + achat |
| 30 prérequis structurels | `TRIGGER`, `REFERENCES` table et colonne, sur dix tables ; refus sans retrait du grant extérieur ni changement d’historique |
| 8 prérequis d’exécution | RPC serveur, trigger de signup, RPC authentifiés et ancien débit fermé |
| 6 contre-épreuves de révision | Véritable ancien email de `4123b25` et cinq corps inconnus ; refus avant toute mutation |
| Rejeu | Quatre migrations puis extension, droits rétablis, données et sept définitions canoniques/signup conservées |

Sans l’extension, les mêmes fixtures sur `78a4b9da` produisent **29 cas PASS et
7 cas FAIL sur 36 exécutés**. Le seul cas omis est celui du nouveau wrapper absent
de cette base. Les refus manquants concernent les séries, l’attachement du trigger
privilégié, une future colonne explicitement accordée, les écritures héritées et
le retrait des droits anonymes. Deux oracles concernent le même droit d’écriture
des séries : ces sept échecs ne sont pas sept vulnérabilités indépendantes.
Le contrôle anonyme porte sur le droit SQL de lecture ; il ne démontre pas une
fuite de lignes dans la fixture. Les droits historiques directs de colonnes des
huit registres sont déjà fermés par cette base : le correctif n’attribue pas ce
résultat existant à l’extension.

### Commandes

Depuis la racine du dépôt, avec un PostgreSQL installé et un utilisateur autorisé
à lancer `initdb` :

```sh
python3 tests/reward-boundaries/native/run.py \
  --pg-bin-dir /chemin/postgresql/bin \
  --evidence-dir /chemin/preuves/reward-boundaries
```

Le lanceur écrit un sous-répertoire neuf `boundaries-native-*` et un `receipt.json`
avec versions, empreintes des entrées avant/après, étapes, cas, nombre de
connexions distantes nul et suppression du cluster. Pour la contre-épreuve :

```sh
python3 tests/reward-boundaries/native/run.py \
  --pg-bin-dir /chemin/postgresql/bin \
  --evidence-dir /chemin/preuves/reward-boundaries-before \
  --before-hardening
```

La seconde commande retourne volontairement **1** lorsque les refus attendus
sont absents. Ses échecs restent des `FAIL` dans le reçu ; ils ne sont pas
convertis en réussite.

## Suites publiées et limites

Les trois suites PGlite de livraison existantes chargent désormais le schéma
complet, les migrations historiques, les quatre migrations publiées et cette
extension. Leurs contrôles de suppressions/réécritures silencieuses, de reçus et
de rollback restent conservés. Ils ne sont pas recopiés dans le nouveau banc.

La fixture native de `tests/delivery` utilise la même composition. Ses **20 cas
multisessions et 12 témoins de verrouillage** restent inchangés et doivent être
reçus dans un environnement autorisant un serveur PostgreSQL. Ils n’ont pas été
réexécutés localement : l’ouverture des sockets a été refusée dans cet
environnement. Le mode `--single` ne prouve ni concurrence entre connexions ni
latence réelle.

La qualification locale ne couvre aucune donnée réelle, application distante de
migration, exposition PostgREST, livraison fournisseur, mise en production ou
charge réelle. Les comptes de tests de la suite applicative, des suites SQL et
des étapes natives ne doivent pas être additionnés lorsqu’ils se recouvrent.
