# Vérification de récupération des webhooks Stripe

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

## Prime J+1 : unicité de l’effet financier

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

La garantie atomique porte sur **transaction financière + solde + reçu**.
`updateProfileById` précède toujours la RPC. Le test séparé
`prime-profile-boundary.test.ts` constate qu’un Event conflictuel peut
modifier les références client et abonnement du profil avant le refus 503
du crédit. Le checkout complet n’est donc pas atomique ; son ordre n’est
pas modifié par ce lot.

PGlite qualifie les instructions SQL, les rollbacks injectés et les droits
dans ce banc. Il ne remplace pas un test PostgreSQL natif à plusieurs
connexions. La concurrence native, le build Next complet, les fournisseurs,
la migration réelle et le déploiement ne sont pas exécutés ici. Le rollout
doit installer la migration avant le helper et retirer les anciens writers
de prime ; un fonctionnement avec plusieurs versions n’est pas qualifié.
