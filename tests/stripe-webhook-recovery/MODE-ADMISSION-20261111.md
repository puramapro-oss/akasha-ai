# Admission du mode Stripe — 11 novembre 2026

## Résultat et défaut corrigé

**PASS sur le périmètre local qualifié. Production : PARTIEL.**

La signature valide d’un webhook ne suffisait pas à vérifier que son mode
correspondait à celui de la clé API configurée. Les deux routes pouvaient
admettre un événement du mode opposé et atteindre des écritures de profil.
La séparation test/live dans la clé du journal ne bloquait pas cette admission.

La nouvelle helper commune déduit le mode des préfixes `sk_test_`, `sk_live_`,
`rk_test_` ou `rk_live_`. Une configuration absente, vide, contenant des espaces,
sans suffixe ou sans mode déductible reçoit `503 webhook_configuration_unavailable`
avant l’appel au SDK et avant tout client DB. Une clé d’organisation `sk_org_`
n’est pas supposée appartenir à un mode : elle reste refusée dans ce contrat.

Après validation réelle de la signature et de l’enveloppe, le handler commun
compare `event.livemode` au mode configuré. Si l’objet porte aussi une propriété
`livemode`, celle-ci doit être booléenne et concordante. Les objets qui ne portent
pas cette propriété restent compatibles. Un désaccord reçoit
`503 webhook_mode_mismatch` avant la création d’un client DB, une admission
durable, une écriture métier ou une complétion.

Les événements concordants et leurs doublons terminés conservent le comportement
antérieur. Les effets, le journal, ses RPC et ses migrations sont inchangés.

## Qualification exécutée

Base exacte : `264839129295b9058df9d2b7942604ef1c5baf2c`.
Environnement : Node 22.23.4, Stripe 22.3.2, Vitest 4.1.11 et Next 16.2.11.
Les dépendances présentes ont été réutilisées sans installation. Les commandes
ont été exécutées avec un environnement fournisseur nettoyé et le réseau refusé
par `sandbox-exec` (`deny network*`).

| Contrôle | Résultat |
| --- | --- |
| Code initial, suite signée finale | 68 PASS / 45 FAIL sur 113 cas |
| Code corrigé, même suite et mêmes assertions | 113 / 113 PASS |
| Commande Vitest exacte du script standard | 223 / 223 PASS : 110 autres cas + 113 cas Stripe |
| TypeScript complet, sans émission ni cache incrémental | PASS |
| ESLint des quatre fichiers produit modifiés | PASS |
| Gardes statiques préexistants | 7 / 7 PASS, comptés séparément |
| Contre-probe indépendant du handler réel | 26 / 26 PASS, comptés séparément |
| Préservation des sources pendant les exécutions finales | PASS |

Zéro échec, cas ignoré ou todo dans la suite finale. Les 113 observations de la
suite standard enregistrent zéro tentative réseau. Les signatures synthétiques
sont produites et vérifiées par le vrai SDK Stripe ; les deux routes, la helper,
le handler, le client du journal et les helpers d’effets sont réellement importés.
Le seul port DB reste en mémoire. Cette preuve ne remplace pas un test natif de
la base ou une livraison Stripe en production.

Les 63 nouveaux cas couvrent les deux routes, les clés standard et restreintes,
les deux modes, les incohérences événement/objet, les configurations non admises,
les modes non booléens, les signatures invalides et les reprises. Les 50 cas
Stripe antérieurs conservent leurs assertions. Leur préparation explicite
désormais la clé synthétique dans l’environnement.

La contre-revue indépendante retrouve exactement les bytes des anciennes routes
et du handler après retrait des seules lignes d’admission ajoutées. Son probe
utilise la vraie helper et confirme huit admissions attendues et dix-huit refus
avant DB, sans réseau.

### Reproductibilité

```sh
node node_modules/vitest/vitest.mjs run --config tests/stripe-webhook-recovery/vitest.config.mts
node node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/stripe/webhook-mode.ts src/lib/stripe/webhook-handler.ts src/app/api/stripe/webhook/route.ts src/app/api/internal/stripe-fulfillment/route.ts
node tests/stripe-webhook-idempotent-no-swallow.spec.cjs
```

La deuxième commande correspond exactement au script `test` du manifeste ;
le lanceur Vitest a été appelé directement avec Node 22.23.4. Les rapports JSON,
observations, journaux et commandes exactes sont conservés dans le reçu consolidé
du chantier et dans le dossier local `.mode-evidence` du worktree de qualification.

### Incidents du banc conservés

Un premier scénario de changement de mode réutilisait le même checkout et
rencontrait le garde indépendant de prime de bienvenue déjà enregistrée :
112 cas passaient, le dernier retournait correctement une réconciliation.
La fixture de ce seul cas a été remplacée par un événement de suppression
d’abonnement. Les assertions restent identiques : refus intermédiaire sans
accès DB supplémentaire, puis deux claims, deux écritures et deux complétions.
Les cas checkout et leurs reprises restent couverts séparément.

La comparaison a ensuite été intégralement rejouée avant et après correction
avec le même fichier de tests. Après écriture des deux rapports valides,
une variable Python réutilisée dans le validateur final a provoqué une erreur
de l’enveloppe d’exécution. Les deux rapports ont été relus et validés séparément ;
aucun résultat de test n’a été modifié. Cet incident reste consigné.

## Empreintes du code qualifié

| Fichier | SHA256 |
| --- | --- |
| `src/lib/stripe/webhook-mode.ts` | `fb7daf3d9e648a904722ce9afcf829660f1ea4ec81e9b983a5157659adb81f59` |
| `src/lib/stripe/webhook-handler.ts` | `cf5b4f1426b968ed1a9dda837507889ae427fb1c8b3afdb72432992f88947986` |
| `src/app/api/stripe/webhook/route.ts` | `e634a38d8c2a66c55e0374ab827b8d13e037ded1f2039db48feee357777acc87` |
| `src/app/api/internal/stripe-fulfillment/route.ts` | `eec627b46f82f3f2d07a879263f4897659b7f2e77e7b5aca8a4251a98fe163dd` |
| `tests/stripe-webhook-recovery/behavior.test.ts` | `63ae86a57dec43e86d97c993edc0aad08facda1a24c4e67378178bea80823e3f` |

## Limites maintenues

Le préfixe de clé ne prouve ni sa validité auprès de Stripe, ni son compte,
ni l’identité de la base cible. Les permissions d’une clé restreinte ne sont pas
testées par cette suite. Le garde de mode ne crée pas une séparation complète
des données entre environnements. Les secrets, les comptes, les endpoints et la
base déployée doivent correspondre à une configuration admise.

Les 24 tests PostgreSQL du lot initial restent une preuve historique séparée :
aucune migration n’a changé ni été relancée pour ce correctif. Aucun paiement,
compte fournisseur, migration de production ou déploiement n’a été exécuté.
Les effets financiers partiels, les événements distincts d’un même objet,
l’ordre de livraison, les contrats de colonnes/RPC et les dépendances privées
restent soumis aux limites déjà consignées dans la PR.

Le build Next complet et la CI de cette nouvelle tête restent NON TESTÉS ;
aucun workflow CI n’est présent dans l’arbre de base. Une réussite locale
ne constitue pas une validation globale de production.

## Références de contrat

- [Stripe : clés API, modes et clés restreintes](https://docs.stripe.com/keys)
- [Stripe : propriété livemode de l’objet Event](https://docs.stripe.com/api/events/object)
- [Stripe : validation des webhooks sur le corps original](https://docs.stripe.com/webhooks)
