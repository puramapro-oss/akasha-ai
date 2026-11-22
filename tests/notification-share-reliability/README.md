# Qualification des reçus AKASHA

Cette campagne complète les suites existantes sans appeler Stripe, Resend ou un
réseau social. Elle consolide les séquences email, le suivi des partages et les
retraits avec les corrections de boutique, de cadeau quotidien et de droits de
profil déjà présentes sur la branche de travail. Le formulaire de contact et
l’export personnel disposent aussi de tests de régression dans les sources.
Les valeurs et les utilisateurs des tests sont synthétiques.

## Exécuter les contrôles

La commande standard du dépôt inclut les régressions TypeScript, les hooks React
dans jsdom et les migrations réelles dans PostgreSQL WASM :

```sh
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint -- --config eslint.config.mjs src
```

PGlite contrôle les transactions et les permissions dans un processus. Pour
observer une concurrence entre sessions PostgreSQL indépendantes, les trois
fichiers `native/*.test.mjs` utilisent le runner déjà présent dans le dépôt.
Ils exigent PostgreSQL, `lsof`, Node et le pilote `pg` installés ; le runner ne
les installe pas et refuse une base ou un répertoire de données existants.

```sh
python3 tests/stripe-webhook-recovery/native/run.py \
  --suite share --node-bin /chemin/absolu/vers/node \
  --driver /chemin/absolu/vers/app/node_modules/pg/lib/index.js \
  --fixture-root /tmp/akasha-pg --output /tmp/akasha-native-results
```

Répéter avec `--suite email` et `--suite withdrawal`. Chaque exécution crée
un cluster marqué, isolé, accessible uniquement par socket Unix privé. Elle
vérifie son identité, observe les blocages avec `pg_blocking_pids`, contrôle
l’absence de listener TCP, arrête son propre serveur, supprime son cluster et
conserve les résultats et empreintes des sources hors du cluster. Les connexions
de chaque scénario sont fermées avant le suivant. Le même runner conserve ses
deux suites antérieures `stripe` et `entraide`.

Les suites partage, email et retrait chargent le schéma complet versionné, son
vrai déclencheur d'inscription, les deux préalables SQL de septembre et les neuf
migrations composées. Le workflow Web exécute les cinq suites, conserve la suite native de livraison
`tests/delivery/run-native.py`, puis exécute les scénarios de popup Chromium.
Ce navigateur intercepte tous les documents et refuse les destinations
inattendues. Les cinq scénarios entrants de reprise entre onglets exercent aussi
le helper canonique dans Chromium. Une seule installation du navigateur précède
ces deux contrôles. Il conserve aussi les contrôles de droits hérités et les
quatre parcours Cycles sur l'application compilée. Le checkout vérifie le SHA
exact proposé et consigne son arbre Git. Aucun compte ni fournisseur réel n’est utilisé.

## Ce que les contrôles établissent

| Parcours | Invariant vérifié |
| --- | --- |
| Séquences email | Consentement explicite à la newsletter et respect des veto de catégorie, une seule autorisation d’envoi, reçu fournisseur lié au contenu, log et journal confirmés ensemble. |
| Partages | Propriétaire authentifié, une attribution par `request_id`, quota UTC atomique, partage, journal et solde de points confirmés dans la même transaction. |
| Retraits | Une réservation et un débit par demande, un seul droit de transfert, compensation unique sur rejet prouvé, plafond journalier et preuve de conclusion. |
| Modification d’un retrait non admis | Annulation durable de l’ancienne clé avant de créer une nouvelle intention ; une réservation déjà gagnante reste protégée. |
| Boutique et cadeau quotidien | Attribution effective des crédits ou points, propriétaire vérifié et rejeu sans nouvelle attribution. |
| Profils | Réglages personnels modifiables, soldes, rôle et abonnement protégés contre les écritures directes du navigateur. |
| Export personnel | Accès aux seuls reçus du compte courant, y compris les achats et les annulations, sans ouvrir les journaux privés ni révéler les jetons internes. |
| Contact | Accusé d’enregistrement distinct de l’acceptation des messages par le fournisseur. |

Une réponse perdue demeure incertaine jusqu’à observation d’un reçu concordant.
Les journaux ne sont pas effacés ni remis à zéro pour forcer un nouvel envoi.
Les tests préservent les lignes historiques et les contrats des autres parcours.
Le test permanent `composition.test.ts` traverse les migrations ensemble, les
permissions SQL et la vraie route GET d’export ; il vérifie aussi que les crédits,
points et euros ne sont pas confondus entre les parcours.

Le partage conserve un seul écrivain, `record_social_share`, et la colonne
`social_shares.request_id` déjà introduite par la branche entrante. Le navigateur
utilise `record_social_share_checked`, qui vérifie l'acteur attendu avant de
déléguer au même écrivain avec le même UUID. L’ancien
candidat `track_social_share` est supprimé. Un reçu entrant complet est retrouvé
par son journal `share/<id>` et rejoué sans recrédit ; un historique incomplet ou
ambigu ne produit pas de confirmation. Le reçu atteste l’intention ou la remise
au mécanisme de partage de l’appareil, pas une publication sur un réseau social.

Les sept séquences email passent par le même journal durable. L’ancienne RPC
`record_email_sequence_delivery` est privée d’exécution pour les rôles applicatifs.
La clé Resend `akasha-email/<type>/<userId>` est conservée. Une acceptation
fournisseur dont la persistance n’est pas confirmée exige un rapprochement :
l’expiration d’une fenêtre d’idempotence ne suffit pas à autoriser un nouvel envoi.

## Limites et déploiement

L’exécution locale native et Chromium du 22 novembre 2026 est bloquée avant les
scénarios par le refus de création de sockets. Le relèvement demandé pour le
cluster SQL isolé a été refusé ; aucun changement de transport ne remplace ce
contrôle. Une réussite ultérieure de la CI doit être attribuée à son propre
commit et environnement, sans transformer le résultat local en réussite.

Les neuf nouvelles migrations doivent être appliquées dans l’ordre suivant,
après les préalables historiques `20260926_daily_gift_atomic_claim.sql` et
`20260926_points_redeem_atomic.sql` déjà présents dans le dépôt.
L’export dépend des journaux privés ; la consolidation du partage dépend du
contrat entrant et de sa colonne `request_id`.

1. `20261122165000_delivery_consistency.sql`
2. `20261122165100_daily_gift_delivery.sql`
3. `20261122165200_points_redemption_authority.sql`
4. `20261122165300_profile_write_boundary.sql`
5. `20261123010000_reward_boundaries.sql`
6. `20261123010100_akasha_withdrawal_idempotency.sql`
7. `20261123010200_email_sequence_delivery.sql`
8. `20261123010300_social_share_tracking_atomic.sql`
9. `20261123010400_delivery_receipts_export.sql`

Ces fichiers non encore déployés utilisent des versions distinctes. Les quatre
premiers correspondent octet pour octet au lot entrant `78a4b9d` ; ils ont été
renommés à partir de leur préfixe commun `20261122` sans changer ce contenu SQL.
L'extension de droits `23010000`, conservée octet pour octet depuis `ca2eeec`,
vérifie les définitions exactes des cinq RPC entrantes avant de poser ses gardes.
Elle doit donc précéder nos quatre extensions encore inédites : son rejeu après
le remplacement des RPC partage et email est volontairement refusé. Les quatre
extensions ont changé de version, de `170000–170300` à `23010100–23010400`,
sans modification de leur SQL lors de ce renommage.
Le dépôt conserve deux collisions historiques de préfixe (`20260926` et
`20261111`) ; avant une application par la CLI Supabase, rapprocher ces anciens
fichiers de l’historique effectif de la base. Les renommer sans cet historique
pourrait faire rejouer une migration déjà appliquée. Cette campagne ne modifie
pas leur identité.

Avant une mise en service, suspendre et drainer les anciens
workers concernés, appliquer les migrations dans la base autorisée, rafraîchir
la découverte PostgREST selon la procédure existante, livrer les nouveaux
handlers et reprendre les appels. Les anciens handlers de retrait et d’email ne
consultent pas le nouveau protocole ; leur arrêt fait partie de la transition.
L’historique incertain nécessite un rapprochement fondé sur des preuves.

Ces suites ne certifient ni le schéma effectif de production, ni la réception d’un
email, ni une publication sociale, ni le versement bancaire final. Elles ne
prouvent pas non plus une absence universelle de latence, un comportement sur
tous les appareils ou une endurance en charge. Aucun de ces résultats n’est
déduit d’un build ou d’un test avec fournisseur simulé.
