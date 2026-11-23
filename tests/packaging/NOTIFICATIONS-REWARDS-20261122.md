# AKASHA — qualification complémentaire du 22 novembre 2026

## Problème traité

Des changements de compte ou de consentement pendant une opération pouvaient
encore utiliser un état devenu périmé. Les préférences enregistrées dans un
même objet JSON pouvaient s’écraser entre deux fenêtres. Les droits hérités
nécessitaient une frontière supplémentaire autour des récompenses.

Cette reprise ajoute les seuls compléments manquants au code applicatif publié
`78a4b9da9e63686d6956da9e643395e3be4b2e4e`, arbre
`6869a9d8ca0f3147d9cf302c54d1bf536f908420`. Elle prolonge la PR 6 existante sur son nouveau parent
`0767a3036276e3e7f6964fd938efaa24b208cf06` (arbre
`9f153a48a5665d4002347c299b528d619150b526`), qui ajoute uniquement
la qualification CI des quatre parcours publics Cycles. Ces ajouts sont conservés.
Les versions concurrentes `4123b25` puis `78a4b9d` ont été rapprochées avant
intégration ; leurs nouveaux contrats de remise ne sont pas remplacés.

## Comportements corrigés

- **Préférences :** sauvegarde des seules catégories éditées, relecture fraîche
  et mise à jour conditionnelle de `types`. Un conflit d’insertion ou de
  comparaison provoque une relecture, dans la limite de trois tentatives et
  du délai commun. Les catégories inconnues, la pause et les modifications
  faites pendant la requête restent conservées. Changement de compte et
  expiration annulent la publication du résultat.
- **Emails :** le consentement est relu après l’attente entre deux envois,
  immédiatement avant le fournisseur. Un refus, une pause, une erreur ou un
  propriétaire incohérent empêchent l’envoi. Les modèles ne présentent plus
  de coupon inventé, de témoignage fictif ni d’activité non mesurée. La
  pagination chronologique, le budget, la clé fournisseur canonique et la
  relecture du journal durable de `78a` sont conservés.
- **Cadeau :** la lecture couvre le jour UTC déclaré et la date d’ouverture
  historique. Deux reçus possibles provoquent un conflit explicite. Le délai
  couvre aussi la lecture du corps HTTP ; une réponse perdue déclenche la
  recherche du reçu. Les coupons restent en attente d’activation, et une
  reprise ne provoque pas une seconde célébration. Le POST, les probabilités
  et montants publiés sont inchangés.
- **Partage :** le bénéficiaire attendu est contrôlé avant les opérations
  locales, avant le RPC et après sa réponse. L’annulation est effective même
  si le transport ignore le signal. Un résultat tardif d’un ancien compte ne
  supprime pas sa demande en attente. Le helper `localStorage`/Web Locks,
  les statistiques agrégées et les trois achats disponibles sont conservés.
- **Droits SQL :** une migration supplémentaire protège les douze champs
  éditables du profil, les séries et huit tables de récompenses. Elle couvre
  les privilèges hérités, les écritures indirectes et les droits structurels.
  Le wrapper de partage à quatre paramètres vérifie l’utilisateur attendu
  avant de déléguer au RPC canonique à trois paramètres.
- **Initialisation :** les index `cross_promos` sont placés après la création
  de leur table afin de permettre l’exécution du schéma complet dans les
  fixtures. Le reste du schéma est conservé.

## Migration et continuité

Les quatre migrations publiées le 22 novembre sont identiques octet pour
octet à `78a`. L’extension suivante doit être appliquée après elles :

`supabase/migrations/20261123010000_reward_boundaries.sql`

SHA-256 :
`8632f74e4a3b3718f15d2ddacfbcad1baaa7316cfb10c5d67d7ce39177a1f941`.

La date du fichier établit un ordre ; elle ne programme pas une intervention.
Avant toute mutation, l’extension vérifie les corps exacts des quatre RPC
mutateurs et des statistiques de `78a`. Une base ayant déjà enregistré les
mêmes noms de migration avec les anciens corps `4123` est refusée avec
`55000`. Le runner reproduit ce cas réel et contrôle la conservation du
corps et de l’historique. Il ne suffit donc pas de constater les noms des
migrations dans une table de suivi pour autoriser la bascule.

Les droits structurels ou d’exécution hérités incompatibles provoquent un
refus explicite. Aucune appartenance externe à un rôle n’est réécrite.
Les sept définitions canoniques et de provisioning contrôlées restent
identiques avant, après et lors du rejeu. Le guide de bascule coordonnée
reste dans [tests/delivery/README.md](../delivery/README.md).

## Qualification du candidat intégré

| Contrôle | Résultat et portée |
| --- | --- |
| Suite applicative standard | **961/961 PASS**, 54 fichiers, zéro ignoré ; les 129 cas SQL PGlite sont inclus |
| Next typegen et TypeScript complet | **PASS** |
| Lint de toutes les sources | **PASS : zéro erreur, quatre avertissements de navigation préexistants** |
| Build Next final | **BLOQUÉ localement** : compilation réussie, phase TypeScript du build interrompue ; contrôle TypeScript séparé PASS |
| PostgreSQL natif 16.16 | **37/37 cas comportementaux PASS**, 194 étapes d’exécution, données synthétiques |
| Contre-épreuve sans extension | **29 PASS / 7 FAIL sur 36 cas**, wrapper nouveau absent explicitement omis |
| Ancien corps email `4123` et cinq corps inconnus | Refus vérifié avant mutation ; historique conservé |
| Schéma complet et migration rejouée | PASS dans le banc natif ; droits et définitions contrôlés |
| Contre-revue indépendante | PASS sur les écarts produit, les quatre migrations conservées et les reçus |
| CI et tests de concurrence/navigateur du nouveau commit | À qualifier après publication ; ne pas réutiliser les résultats de `78a` pour ce candidat |

Les sept échecs du baseline ne correspondent pas à sept vulnérabilités
distinctes : deux oracles contrôlent les mêmes droits des séries. Un retrait
de droit anonyme n’établit pas à lui seul une fuite de lignes.

Trois tentatives de build sont conservées : la première termine avec `137`
après compilation, la seconde atteint le plafond V8 imposé de 768 Mio, et la
troisième (plafond 1280 Mio) échoue dans la phase TypeScript sans diagnostic
TypeScript détaillé. Aucun contrôle de types du build n’a été désactivé.
Le contrôle `tsc --noEmit --incremental false` séparé passe ; cela ne transforme
pas le build local incomplet en réussite. La CI doit lever cette réserve.

Les 117 tests ciblés emails/préférences, les 63 tests ciblés partage et les
29 tests ciblés cadeau sont des périmètres inclus ou recoupés par la suite
globale ; leurs nombres ne doivent pas être additionnés aux 961 tests.
Les 194 étapes SQL ne sont pas 194 cas comportementaux indépendants.

Commandes applicatives, après préparation des dépendances privées vérifiées :

```sh
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint -- --config eslint.config.mjs src
npm run build
```

Les commandes natives et les détails des contre-épreuves sont décrits dans
[tests/reward-boundaries/README.md](../reward-boundaries/README.md).
Le workflow conserve les vingt cas PostgreSQL multisessions et leurs douze
témoins de blocage, les cinq cas Chromium du helper canonique, les quatre parcours publics Cycles
sur Next compilé, et les gates
Stripe/Entraide existants. Il ajoute le banc de droits et la sauvegarde des
reçus. Les résultats intermédiaires Playwright sont placés hors du dépôt
pour préserver les anciens rapports suivis dans Git.

## Limites de cette qualification

La qualification locale des droits utilise PostgreSQL en mode séquentiel,
avec rôles réels et contrôle RLS calibré. Le refus local des sockets n’a pas
été contourné ; aucun nouveau navigateur ni serveur multisession local
n’est revendiqué. La CI `45051932625` a validé ces aspects pour `78a`,
uniquement pour cette ancienne révision. La CI du nouveau commit doit
qualifier de nouveau ses entrées exactes.

Aucun fournisseur réel, aucune migration distante, aucun paiement, email,
déploiement de production ni test physique n’a été exécuté dans ce lot.
Les dix articles indisponibles et les coupons en attente ne sont pas
annoncés livrés. Le cron d’email n’est pas ajouté à la planification Vercel.
Les performances sous charge, la latence de production et les parcours
complets avec session réelle restent à mesurer sur l’environnement cible.
Les réserves métier de `ERRORS.md` restent ouvertes.
