# Vérification de récupération des webhooks Stripe

## Correction du profil et de la prime, 11 novembre 2026

Cette correction additive part du candidat publié
`a83e816a0c0338f2ce569d8befc5ddca586ae61d`. Elle réunit **profil + prime** dans
une seule transaction SQL pour les Checkout Sessions portant un `user_id`.
Les montants, droits et règles d’éligibilité restent ceux du lot financier.
Le journal d’Event, la conversion cross-promo et les autres effets Stripe
restent séparés. Une erreur cross-promo après le commit conserve le refus
503 et la réconciliation de l’événement ; elle n’annule pas ce commit.

### Contrat transactionnel et replays

`complete_checkout_prime_j1` verrouille le profil, appelle la fonction
financière existante, confirme l’écriture du profil puis attache au reçu une
empreinte de cette intention, dans la même transaction. Une erreur avant
commit annule profil, portefeuille, transaction et reçu. Une réponse perdue
après commit conserve ces quatre éléments ensemble : le handler renvoie 503
et maintient la barrière de réconciliation, sans répéter automatiquement la
RPC. Les tests à doubles modélisent ces issues de commit ; les tests PGlite
vérifient les écritures SQL réellement persistées.

La clé financière reste compte / mode / Session. Le reçu lie aussi les
références client et abonnement et le couple plan/tier effectivement écrit.
Les métadonnées incomplètes continuent de ne modifier ni plan ni tier.
Un même bénéficiaire avec une intention différente est refusé. Un replay
exact réussit **sans aucun UPDATE profil**, même si un abonnement plus récent
a depuis modifié ce profil. L’horodatage local d’une nouvelle livraison
n’entre pas dans l’identité ; la date de début est écrite au premier commit.

L’empreinte v1 contient le préfixe `akasha-checkout-profile-v1;`, suivi dans
l’ordre de customer, subscription, plan, tier. Une chaîne est encodée par sa
longueur en octets UTF-8, `:`, sa valeur et `;` ; NULL est `n;`. Ce cadrage
évite les ambiguïtés des séparateurs et ne dépend pas d’un rendu JSON entre
JavaScript et PostgreSQL. SHA-256 est calculé avec Node et la
[primitive PostgreSQL intégrée](https://www.postgresql.org/docs/18/functions-binarystring.html).
Le reçu conserve seulement 32 octets d’empreinte supplémentaires, pas une
seconde copie des identifiants Stripe. Les cas UTF-8 et séparateurs sont
comparés entre les deux implémentations dans PGlite.

Les reçus financiers antérieurs sans empreinte restent en réconciliation.
Le profil courant ne permet pas de reconstruire une ancienne intention.
Aucune adoption, reprise automatique ou prime rétroactive n’est ajoutée.
Le tombstone de Session et son empreinte survivent à la suppression du compte
avec `user_id = NULL` ; un autre bénéficiaire ne peut pas les réutiliser.

### Migration, droits et compatibilité

La migration nouvelle est `20261112_prime_j1_profile_atomic.sql`. Le numéro
est la version ordonnée suivante au format de huit chiffres du dépôt : il
vient après les deux fichiers `20261111`, sans renommer de migration publiée.
La fixture applique explicitement journal, prime financière puis profil.
Un test contrôle l’ordre des fichiers et le refus de la nouvelle migration
si son prérequis financier manque. Le mécanisme de migration de production
reste NON TESTÉ ; ce contrôle local ne qualifie pas un rollout réel.

Seul `service_role` peut appeler la nouvelle RPC. L’ancienne signature
financière est retirée à PUBLIC, anon, authenticated et service_role ; son
propriétaire conserve le droit nécessaire à la composition SECURITY DEFINER.
Les reçus restent sans accès direct pour les rôles applicatifs. Les tests
exécutent les refus des deux fonctions et les droits de la table.

**Retirer ou drainer les anciens writers avant cette migration est requis.**
L’ancien handler écrit le profil avant d’appeler son ancienne RPC : pendant
une coexistence de versions, il pourrait encore modifier le profil puis
échouer sur le droit révoqué. Il faut ensuite installer les migrations dans
leur ordre et activer le nouveau handler. Aucun déploiement mixte ni protocole
d’interruption en production n’est qualifié ici.

### Preuves locales de cette correction

| Gate | Résultat |
| --- | --- |
| 11 cas causaux sur a83, anciens schéma et droits, premier checkout 200 | 8 FAIL / 3 PASS |
| Mêmes 11 cas et mêmes assertions après correction | 11 / 11 PASS |
| Contrats SQL profil : empreinte, replay sans UPDATE, legacy, rollback tardif, ACL et prérequis | 15 / 15 PASS |
| Validation de la nouvelle preuve par le helper, sans fallback ni retry | 10 / 10 PASS |
| Suite composée | 303 / 303 PASS : 223 amont + 80 prime |
| TypeScript strict du périmètre Stripe et des tests | PASS |
| Lint des trois sources produit et cinq fichiers prime concernés | PASS |
| Lint de `behavior.test.ts` | PARTIEL : dépassement de la règle existante de 300 lignes |

Les 113 scénarios amont restent présents. Seuls les oracles qui décrivaient
un état partiel désormais interdit ont été adaptés :

| Scénarios | Ancien oracle | Oracle transactionnel |
| --- | --- | --- |
| Deux pertes d’acknowledgement, dont une réconciliation indisponible | Profil écrit, aucune transaction | Profil + prime + reçu commis ; 503 ; aucun replay aveugle |
| Quatre pannes wallet avant commit | Profil déjà écrit | Aucun profil, ledger, reçu ou solde partiellement commis |

La comparaison AST conserve toutes les autres assertions historiques, les
quatre cas financiers initiaux et les 23 cas SQL financiers ; ces derniers
appellent désormais la RPC de complétion. L’ancienne caractérisation du profil
modifié avant refus est remplacée par les régressions rouges puis vertes.

Ces gates utilisent PGlite 0.5.16 en mémoire, PostgreSQL 18.6 compilé en WASM,
Node 24.22.1 et Stripe 22.3.2, sans extension SQL ajoutée. Le lanceur retire
les variables fournisseur et interdit les points d’entrée réseau Node ; les
reçus enregistrent zéro tentative réseau. Il ne constitue pas une isolation
réseau OS. PostgreSQL natif à plusieurs connexions, build Next complet,
fournisseur réel, paiement, déploiement et base de production restent NON TESTÉS.

L’intégration demeure PARTIELLE : PGlite 0.5.16 est disponible dans le runtime
isolé mais son ajout aux manifestes reste confié au propriétaire packaging.
Le handoff contient une proposition sémantique sur la base publiée ad36 et
refuse les fichiers SWC actifs dont les empreintes diffèrent. Cette préparation
ne constitue ni une intégration de dépendance ni une installation propre.

## Qualification complémentaire du 11 novembre 2026

Le [contrôle de concordance des modes Stripe](MODE-ADMISSION-20261111.md)
complète ce lot : 113 scénarios Stripe, 223 tests applicatifs au total,
TypeScript complet, lint ciblé et 7 gardes statiques PASS. Les résultats
ci-dessous sont conservés comme historique du lot initial.

## Périmètre

La suite `behavior.test.ts` importe les deux routes réelles, le handler commun,
le client du journal et les helpers d’effets. Elle utilise Stripe 22.3.2 pour
produire et vérifier des signatures synthétiques.

Les frontières Supabase restent en mémoire. Aucun fournisseur, service,
compte, paiement ou base de données réel n’est appelé. Les cas Karma historiques,
EUR et USD exécutent le vrai dispatcher et son calcul, avec son seul client
Supabase injecté. Les autres scénarios de refus du dispatcher utilisent un port
explicite renvoyant un résultat ou une exception.

Le dossier `native/` contient le banc SQL séparé. Les doubles de cette suite
ne prouvent ni les contraintes PostgreSQL, ni les permissions, ni les recherches
réelles dans les deux tables de claims héritées.

## Exécution

Avec les dépendances déclarées déjà présentes :

```sh
npm test
node tests/stripe-webhook-idempotent-no-swallow.spec.cjs
```

Le script standard conserve les includes et alias antérieurs, et ajoute
uniquement `tests/stripe-webhook-recovery/*.test.ts`. Le sous-dossier natif
n’est pas collecté par ce glob.

Pour la seule suite de récupération :

```sh
node node_modules/vitest/vitest.mjs run --config tests/stripe-webhook-recovery/vitest.config.mts
```

La configuration ciblée utilise un worker, aucun parallélisme entre fichiers,
et une borne de 3 secondes par cas. Le gate standard conserve sa configuration
antérieure. Les exécutions locales du 11 novembre 2026 ont été isolées par
`sandbox-exec` avec `deny network*`, environnement sans variables fournisseur
héritées, écritures limitées au clone et arrêt vérifié du groupe de processus.
Les commandes, observations et reçus détaillés sont conservés dans les preuves
locales du chantier ; aucune CI ni publication n’a été déclenchée pour ce lot.

## Résultats observés du lot initial

| Étape | Résultat |
| --- | --- |
| Six contre-épreuves initiales sur le code hérité | 2 PASS / 4 FAIL |
| Sept anciens gardes statiques, au même moment | 7 PASS ; insuffisants pour détecter ces défauts |
| Journal commun, première suite composée | 45 / 45 PASS |
| Reçu financier historique `already_processed`, vrai dispatcher avant correction | 45 PASS / 1 FAIL |
| Même suite après refus du reçu ambigu | 46 / 46 PASS |
| Facture USD signée, avant contrôle monétaire | 48 PASS / 1 FAIL |
| Gate standard final | 160 / 160 PASS : 110 existants + 50 nouveaux |
| Gardes statiques adaptés au handler commun | 7 / 7 PASS, séparément |

Le gate final a pris 15,962 secondes sous Node 26.0.0, sans échec, skip, todo
ou timeout. Les 110 noms de cas existants ont tous été retrouvés ; aucun cas
n’a été retiré. Les 50 observations de récupération n’enregistrent aucun
appel réseau.

## Propriétés discriminantes

- L’authentification et la signature précèdent l’admission et les effets.
- Les deux routes partagent une seule admission pour un événement donné.
- Une admission seule, un traitement concurrent, un ancien claim ou une
  réconciliation en attente ne sont pas assimilés à une fin confirmée.
- L’identité, l’empreinte, le mode, le compte et le jeton du reçu sont contrôlés.
  Les métadonnées de livraison et l’ordre des clés JSON ne modifient pas
  artificiellement l’empreinte sémantique.
- Toute erreur d’un effet requis interdit la completion. Un effet partiel
  conserve sa barrière ; le test ne supprime jamais le claim pour réessayer.
- Une completion persistée dont la réponse est perdue renvoie d’abord 5xx.
  Seul un reçu durable correspondant obtenu ensuite autorise un doublon 200.
- Le vrai dispatcher ne considère plus une simple ligne financière historique
  comme la preuve de ses quatre crédits.
- Une facture USD ne produit ni RPC financier ni completion. Une facture à
  zéro EUR conserve son log de saut confirmé, sans RPC financier ni doublon.

## Limites

Ces tests qualifient les décisions du code à partir de reçus et d’erreurs
contrôlés. La preuve native du journal, les migrations déployées, la livraison
réelle Stripe et les flux de production restent des qualifications séparées.

Le journal d’événement n’établit pas l’atomicité des anciens effets financiers,
l’ordre de réception de plusieurs événements, ni l’unicité économique entre
deux identifiants Event différents décrivant le même objet Stripe. Aucun taux,
conversion de devise, worker de reprise ou suppression de claim n’est ajouté.
Une issue ambiguë reste en réconciliation au lieu de répéter automatiquement
des effets partiels.

## Historique prime J+1 : unicité de l’effet financier

Le lot prime repose sur la tête `2e4cf86dfd3fb8ef5a0f10382ace079acecc5d30`.
Il conserve les contrôles de mode, les 113 assertions Stripe de cette tête et
les 110 autres cas. Son montant reste **25 EUR** ; il ne change aucun taux,
droit ou condition d’éligibilité. La devise du reçu désigne la prime,
indépendamment de la devise de la session d’achat.

La [documentation officielle Stripe sur les événements dupliqués](https://docs.stripe.com/webhooks#handle-duplicate-events)
distingue les répétitions d’un même Event des Events distincts décrivant un
même objet. Ici, l’identité métier de la prime est **compte / mode / Checkout
Session**. Le type d’événement et son Event ID ne créent pas un nouveau droit
à cette prime. Le journal de livraison conserve sa propre identité par Event.

La migration `20261111_prime_j1_atomic.sql` ajoute une RPC accessible seulement
à `service_role`. Elle verrouille le portefeuille, relit le reçu après le
verrou, puis inscrit la transaction, incrémente les deux soldes et conserve
le reçu dans la même transaction SQL. La clé unique de la Session arbitre
également les demandes concurrentes vers deux bénéficiaires. Une erreur
annule les écritures financières de cette RPC. Le helper exige un reçu
correspondant au compte, au mode, à la Session, au bénéficiaire, au montant,
à la devise et à la promotion avant de confirmer le crédit.

Les transactions anciennes sans reçu structuré restent ambiguës. Une
description contenant littéralement la Session, pour tout bénéficiaire,
interdit un nouveau crédit automatique. Aucun backfill ni versement
rétroactif n’est ajouté. Les reçus structurés restent présents si un
portefeuille ou sa transaction descriptive disparaît. La suppression d’un
compte détache le bénéficiaire avec `ON DELETE SET NULL` : elle continue de
fonctionner, mais la Session consommée ne peut plus être attribuée à un
autre profil. Ce comportement ne définit pas une politique juridique de
conservation et ne reconstruit pas les historiques déjà supprimés.

### Vérifications du lot prime

`prime-fixture.ts` exécute les définitions de tables versionnées et les vraies
migrations dans **PGlite 0.5.16 en mémoire**, sans serveur ni socket. Le port
Supabase traduit les appels en SQL paramétré ; les routes, handlers et
signatures Stripe sont réels. Les quatre assertions causales restent
identiques avant et après correction. Lors du rapprochement de la nouvelle
tête, seule la clé de mode synthétique requise a été ajoutée à leur fixture.

| Gate | Résultat observé |
| --- | --- |
| Tête `2e4cf86`, quatre assertions causales avant correction | 3 FAIL / 1 PASS |
| Même Session, deux Event IDs ; Sessions distinctes, même portefeuille ; bénéficiaire conflictuel ; témoin même Event | 4 / 4 PASS après correction |
| Suppression de compte puis nouvel Event vers un autre bénéficiaire | FAIL avec cascade du reçu ; PASS avec reçu détaché |
| Contrats SQL : reçu, namespaces, conflits, erreurs injectées, legacy, suppression et ACL | 23 / 23 PASS |
| Validation du reçu par le vrai helper | 16 / 16 PASS |
| Caractérisation de la mutation préalable du profil | 1 / 1 PASS ; limite constatée ci-dessous |
| Suite standard composée | 268 / 268 PASS : 223 amont + 45 cas prime |
| TypeScript strict du périmètre Stripe et des tests | PASS |
| Lint des deux sources produit modifiées et des six nouveaux fichiers de test | PASS |
| Gardes statiques existants | 7 / 7 PASS, séparément |

La suite finale utilise Node 24.22.1, Stripe 22.3.2 et Vitest 4.1.5, sans
skip ni todo. Le lanceur de vérification retire les variables fournisseur
héritées et bloque les points d’entrée réseau Node ; zéro tentative a été
enregistrée. Ce garde ne constitue pas une isolation réseau au niveau OS.
Une tentative générale précédente n’avait collecté que 178 cas à cause
d’imports `sonner` absents du runtime isolé ; elle reste un échec de setup.
Les dépendances déclarées manquantes ont été installées à leurs versions
verrouillées avant le gate final. Les quatre assertions initiales et les
113 assertions amont n’ont pas été affaiblies.

### Intégration et limites restantes

Les tests prime sont collectés par le script standard existant. Ils exigent
la dépendance de développement `@electric-sql/pglite` **0.5.16**. Son ajout au
manifeste et au lock est transmis au propriétaire du lot packaging actif ;
ces deux fichiers restent inchangés dans ce lot. Le runtime isolé qualifie
le comportement et ne certifie pas encore une installation propre du dépôt.

Dans le snapshot financier publié a83, la garantie atomique portait sur
**transaction financière + solde + reçu**. `updateProfileById` précédait la
RPC et le test de caractérisation constatait une mutation du profil avant
le refus financier 503. Cette limite historique est la cause des régressions
et de la correction profil + prime décrites en tête du présent document.

PGlite qualifie les instructions SQL, les rollbacks injectés et les droits
dans ce banc. Il ne remplace pas un test PostgreSQL natif à plusieurs
connexions. La concurrence native, le build Next complet, les fournisseurs,
la migration réelle et le déploiement ne sont pas exécutés ici. Le rollout
doit installer la migration avant le helper et retirer les anciens writers
de prime ; un fonctionnement avec plusieurs versions n’est pas qualifié.
