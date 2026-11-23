# AKASHA

Application Next.js : conversations et outils IA, agents, paramètres,
notifications et programmes de récompense PURAMA.

## Préparer le dépôt

La CI utilise Node 24.22.1 et le verrou npm du dépôt. SMARANA, ENTRAIDE et les
composants partagés proviennent de sources PURAMA. Leur préparation doit
conserver les révisions et empreintes de `tooling/shared-packages.lock.json`
ainsi que `package-lock.json`.

Les procédures existantes sont exécutées par
`scripts/bootstrap-shared-packages.mjs` et
`scripts/install-private-dependencies.mjs` dans
[le workflow web](.github/workflows/web-ci.yml). Les sources privées doivent
être résolues avant une compilation produit.

Après installation et configuration de l’environnement de développement :

```sh
npm run dev
```

## Vérifications

```sh
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint -- --config eslint.config.mjs src
npm run build
```

La suite standard comprend les tests des routes et les composants React dans
jsdom. Les transports contrôlés n’envoient ni email, ni paiement, ni requête
applicative à un fournisseur réel. Les contrôles PostgreSQL natifs restent
distincts ; leurs commandes figurent dans les notes ci-dessous et dans la CI.

## Schéma et migrations

`schema.sql` initialise le schéma de base. Les migrations historiques restent
nécessaires. La réconciliation conserve les quatre migrations déjà publiées
par `4123b25`, dans leur version durcie `78a4b9d` et les contrats de remise de boutique, de partage, de cadeau et
journal d'email. L'extension `20261123010000_reward_boundaries.sql` doit les suivre.
La date dans le nom est un ordre de migration ; elle ne planifie aucune action.
La consolidation des journaux durables place ensuite les quatre extensions
`23010100` à `23010400` : retraits, email, partage et export personnel. Les neuf
migrations nouvelles ont des versions distinctes ; les cinq SQL entrants sont
préservés. L'ordre complet et les précautions sur les collisions historiques
figurent dans [la qualification des reçus](tests/notification-share-reliability/README.md).

Consulter [la coordination du lot publié](tests/delivery/README.md) avant toute
bascule : schéma, routes et clients doivent être déployés ensemble dans une
fenêtre contrôlée. Les anciens clients peuvent être incompatibles avec les
nouveaux droits. Les données historiques et coupons en attente restent intacts ;
aucun crédit compensatoire ni activation fournisseur n'est inventé.

## Preuves et limites par lot

- [Notifications : préférences, erreurs, pagination](tests/notifications/README.md).
- [Reçus durables, contact, retraits et export personnel](tests/notification-share-reliability/README.md).
- [Livraison transactionnelle : partage, boutique, cadeau et reçus](tests/delivery/README.md).
- [Qualification commune du 22 novembre](tests/packaging/NOTIFICATIONS-REWARDS-20261122.md).
- [Qualification des dépendances précédente](tests/packaging/DEPENDENCY-SECURITY-20261122.md).

Un build local ou une réponse HTTP ne certifie pas le déploiement, les sessions
réelles ou les appareils physiques. Les notes conservent séparément les preuves
locales, les contrôles CI et les éléments non exécutés.
