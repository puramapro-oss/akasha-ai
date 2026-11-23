# Contact : concurrence et reprise sur PostgreSQL natif

## Résultat du 23 novembre 2026

**PASS — 10 tests, aucun échec, aucun test ignoré**, sur PostgreSQL 17.12.
La suite appelle la vraie fonction `POST` de `src/app/api/contact/route.ts`
et le vrai SDK Supabase. Un transport HTTP synthétique exécute les requêtes
sur des connexions PostgreSQL distinctes. Le limiteur et Resend sont simulés.
Chaque test contrôle l'absence d'appel HTTP externe et de connexion restante.

| Cas | Résultat vérifié |
| --- | --- |
| Première opération | Une ligne, un reçu, une paire de notifications |
| Deux requêtes identiques concurrentes | Attente PostgreSQL observée, une seule insertion et une seule paire de notifications |
| Même identifiant, corps différent | L'original reste intact ; la seconde requête reçoit 503 |
| Accusé d'insertion perdu après COMMIT | Relecture de la ligne ; aucun nouvel envoi incertain |
| Accusés d'insertion et de relecture indisponibles | Première réponse 503, reprise 200, même ligne unique |
| Réponse au navigateur perdue | Répétition sans nouvelle ligne ni nouvelle notification |
| UUID majuscule puis minuscule | Une seule opération persistée |
| UUID invalide | Rejet 400 avant toute requête SQL ou notification |
| Quatre identifiants distincts concurrents | Quatre lignes, sans déduplication indue |
| Rôle de service minimal | SELECT/INSERT suffisent ; UPDATE/DELETE refusés avec 42501 |

Les deux scénarios de contention exigent des PID différents et une attente
`Lock` dont `pg_blocking_pids` désigne réellement le propriétaire de l'insertion.
Ils ne se contentent pas de lancer deux promesses en parallèle.
Les pertes d'accusé sont injectées après un vrai COMMIT ; il ne s'agit pas
d'une coupure réseau réelle ni d'un serveur PostgREST complet.

## Reproduire

Depuis la racine du dépôt, avec ses dépendances installées et les binaires
`postgres`, `initdb`, `pg_ctl` disponibles dans le même répertoire :

```sh
python tests/contact/native-idempotency.py \
  --pg-bin /chemin/vers/postgresql/bin \
  --output /chemin/vers/un-nouveau-repertoire-de-preuves
node node_modules/typescript/bin/tsc --noEmit -p tests/contact/native-idempotency.tsconfig.json
node node_modules/eslint/bin/eslint.js tests/contact/native-idempotency.test.ts tests/contact/native-idempotency.config.mts
```

Le lanceur crée un cluster jetable, lié uniquement à `127.0.0.1`, avec
authentification SCRAM, mot de passe aléatoire et fichier privé. Il vérifie
le refus d'une connexion sans mot de passe et avec un mot de passe erroné.
Le test vérifie l'identité du cluster et l'absence préalable du schéma avant
de créer sa fixture. La table et le GRANT sont extraits de `schema.sql` et
de la migration existante `20261122165000_delivery_consistency.sql`.
Le cluster, son secret et son répertoire sont ensuite supprimés ; le lanceur
vérifie l'arrêt du serveur et la fermeture du port.

## Preuves et portée

- `evidence/native-20261123-final/receipt.json` : commandes exactes, empreintes
  des entrées, 10/10 tests, deux attentes observées et nettoyage vérifié.
- `evidence/native-20261123-final/results.json` : résultats détaillés Vitest.
- `evidence/native-quality-20261123/receipt.json` : TypeScript et ESLint PASS.
- `evidence/native-20261123/` : première exécution native, conservée séparément ;
  la version finale utilise `pg_backend_pid()` avec des types vérifiés.
- `evidence/native-idempotency-manifest.json` : empreintes des fichiers et
  correspondance entre les journaux bruts et leur compression sans perte.

Le contenu de la route qualifiée possède l'empreinte SHA256
`6ff809fe32e16ef14f073c6e0d6937563482f4b611c79099e4bbcd6ef5a160d0`.
Son empreinte est vérifiée avant et après l'exécution. Cette suite ne modifie
aucun code produit, aucune migration et aucune base distante.

Le test de permissions démontre le fonctionnement avec le GRANT minimal du
schéma synthétique ; il ne décrit pas les droits effectifs de la production.
L'envoi réel d'e-mails, la limitation réelle des requêtes, PostgREST distant,
le navigateur et le déploiement ne sont pas qualifiés par cette suite.
La configuration dédiée l'isole des suites unitaires ordinaires ; elle
exige explicitement le lanceur et son cluster jetable.
