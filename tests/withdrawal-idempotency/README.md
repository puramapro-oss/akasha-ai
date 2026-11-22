# Retraits AKASHA : admission durable, envoi unique, reçu confirmé

## Portée et sources

Le correctif relie `POST /api/connect/withdraw`, le service de retrait, un journal
SQL privé et le parcours React existant. Il conserve les montants, seuils,
commissions et paliers définis dans les sources du projet. Les anciennes RPC
financières, le ledger, les helpers Stripe partagés et les autres applications
ne sont pas modifiés.

Sources vérifiées avant conception :

- AKASHA, base locale `e56aaa524c363728c90799f225b6fd9b799835d3` ; la route
  historique avait pour blob Git `29d10ffb089340c74081e4e193b3dfac4b4f3102`.
- `migrations/v4.1-akasha-withdrawals.sql`, blob
  `de367c9e7852dbf665dfeefc3b4bfb37f5a22743`. Les deux RPC anciennes n'acceptent
  aucune clé d'opération. Leur SQL exact reproduit deux débits de 20 €
  (`100 → 80 → 60`) et deux compensations (`100 → 80 → 100 → 120`) sur des
  données synthétiques. `reproduce-legacy.mjs` conserve cette reproduction.
- `schema.sql` définit réellement `akasha_ai.profiles.wallet_balance`.
- MIDAS, `migrations/v4.1-connect-withdrawals.sql`, blob
  `64cbb5e72f44ba325df15a333a820382b7aa8d69` : le reçu partagé contient
  `metadata jsonb`, les statuts `pending/paid/failed/reversed` et une unicité sur
  `stripe_transfer_id`. La fixture reprend sa définition de table exacte.
  Le chemin des éléments antifraude est `metadata.fraud`. Aucun champ partagé
  `fraud_metadata` n'est supposé.
- `packages/purama-antifraud/src/trust.ts` définit un plafond **par jour** de
  `0 / 50 / 500 / null` euros selon le palier. La nouvelle admission applique
  ces valeurs existantes à une journée UTC de 24 heures. Le fuseau n'était pas
  précisé dans le contrat historique ; UTC est donc une décision explicite.
- Documentation fournisseur : <https://docs.stripe.com/api/idempotent_requests>.
  Une clé Stripe seule ne constitue pas une unicité durable : elle peut être
  élaguée après au moins 24 heures.

## Invariants du protocole

La paire `(user_id, request_key)` désigne une seule intention. Montant résolu,
montant demandé ou absence de montant, destination et mode Stripe sont figés.
Le verrou de profil sérialise les admissions. Réserver la clé et débiter le
wallet forment une seule transaction ; une clé différente ne contourne pas
une demande encore non résolue du même propriétaire.

Une intention refusée avant admission peut être annulée explicitement.
`cancel_akasha_withdrawal(user_id, request_key)` prend le même verrou de profil
et conserve une tombstone privée dans `akasha_ai.withdrawal_cancellations` si
aucune admission n'existe. La réservation interdit ensuite cette clé, y compris
pour un ancien POST retardé. Si une admission a déjà gagné, la RPC renvoie son
reçu sans confirmer l'annulation. Cette voie ne débite et ne recrédite rien.
La tombstone est relue après les triggers avant d'accuser sa persistance.

Le plafond cumule les demandes du jour encore engagées ou terminées, ainsi que
l'historique partagé attribuable à AKASHA. Les nouveaux reçus ne sont pas
comptés deux fois. Un historique partagé impossible à attribuer bloque
l'admission concernée. Un ancien reçu en échec est conservativement compté
si aucune compensation confirmée du nouveau journal ne l'explique.

`claim_akasha_withdrawal` ne rend le droit d'envoyer qu'une fois. Même le même
jeton de tentative ne récupère pas ce droit après un accusé de réception perdu.
La clé fournisseur est dérivée de l'identifiant de journal. Les retries réseau
du SDK sont désactivés pour cet appel ; son délai est de 20 secondes.

Un transfert doit correspondre au propriétaire, à l'application, à la demande,
au montant, à la devise, à la destination et au mode attendus. Un reçu partagé
et un journal terminé doivent être persistés dans la même transaction avant
de répondre succès. Seul un refus SDK explicite, authentifié par sa forme et
son identifiant de requête, avec un code d'absence d'exécution autorisé, permet
la compensation. La compensation, le reçu d'échec et le journal rejeté sont
atomiques et uniques.

Un résultat incertain reste `sending` ou `reconciliation` : aucun second envoi
et aucun crédit automatique ne sont autorisés. Une preuve tardive conforme
peut terminer la demande via la RPC de conclusion. Une réservation d'un jour
UTC précédent, jamais autorisée à partir, est rejetée et recréditée une seule
fois lors de sa reprise. Les vérifications d'éligibilité, le gel persistant et
la destination sont contrôlés avant de reprendre une réservation.

Chaque mutation vérifie `RETURNING`, puis relit les lignes réellement
persistées. Les triggers BEFORE qui annulent silencieusement une écriture et
les triggers AFTER qui la réécrivent provoquent un rollback. Le rejeu d'un
reçu ancien ne compare pas son solde historique au solde courant.

Les RPC du nouveau service ont une borne de 10 secondes. L'expiration d'une
attente n'affirme ni rollback ni absence d'opération. Le client cesse d'attendre
au bout de 45 secondes et conserve l'intention.

## Parcours client et réponses concurrentes

Le client conserve une intention locale versionnée par propriétaire, sans
secret. Les montants et la clé survivent aux erreurs réseau, fermetures et
rechargements. `useSyncExternalStore` suit les changements du stockage dans
le même onglet et entre onglets. Le verrou de soumission est synchrone. Un
changement de compte ou un démontage empêche une réponse tardive d'affecter
le nouveau propriétaire. Le POST indique le propriétaire attendu en plus de
la session authentifiée.

Une réponse de succès doit confirmer la clé, le reçu, le montant, un solde
valide et l'identifiant de transfert. Une réponse de refus ne libère l'intention
qu'après confirmation du rejet et de la restauration. Une erreur de préflight
ne suffit jamais à abandonner la clé : une autre requête pourrait avoir été
admise entre deux lectures. Le serveur relit le journal avant ce refus.

Le rejeu est lu avant le solde : un retrait de tout le wallet reste vérifiable
à zéro. Une autre clé reçoit l'intention active, que le client peut reprendre
avec son montant initial, y compris si le montant était omis. Après succès
confirmé, une nouvelle demande explicite utilise une nouvelle clé.

Le stockage indisponible ou corrompu empêche une nouvelle émission. Une
intention conservée après refus préalable reste vérifiable avec la même clé.
Le bouton « Annuler pour modifier ma demande » libère le montant seulement
après réception d'une annulation persistée, identifiée et liée au propriétaire.
Une demande de 100 € refusée au plafond de 50 € peut ainsi être remplacée par
une nouvelle intention de 20 €. Une admission déjà engagée demeure protégée.
Si la réponse d'annulation est perdue, la même annulation est rejouable.

## Recette synthétique reproductible

Depuis `app/` :

```sh
node node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts tests/withdrawal-idempotency
node tests/withdrawal-idempotency/reproduce-legacy.mjs
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

La suite comporte 103 cas répartis sur six fichiers : SQL (32), triggers
adverses (15), annulation (9), service (17), route HTTP (10), client React (20). Les tests
exécutent le vrai SQL dans PGlite, la vraie route et le vrai service, ainsi que
le hook, le bouton et le modal dans JSDOM. L'authentification, les lectures
publiques de profil/Connect et Stripe sont synthétiques. Un test SQL distinct
vérifie le champ partagé et son chemin JSON sur la table canonique.

Les cas couvrent les droits SQL, les débits/compensations uniques, le plafond,
la reprise sans solde, les erreurs DB et fournisseur, les accusés perdus, les
RPC qui ne répondent pas, les réponses tardives, les changements de compte,
le stockage local, le gel persistant, une course de deux POST à la même clé et
la course entre annulation et admission. Une annulation qui perd face à une
réservation, une émission ou un rapprochement ne libère jamais l'intention.
Deux cas DST exécutent le corps SQL installé en ne substituant que son horloge
et le défaut de date de création, sous `Europe/Paris`, pour vérifier les bornes
UTC au printemps et à l'automne.

## Limites et intégration

Cette recette ne prouve pas un retrait bancaire, un fonctionnement en
production ni une absence universelle de latence. Aucun fournisseur, wallet
réel ni base distante n'a été utilisé. PGlite ne qualifie pas la concurrence
entre plusieurs connexions serveur. La suite PostgreSQL native préparée dans
`tests/notification-share-reliability/native/withdrawal.test.mjs` complète ce
point en CI normale ; son exécution locale est bloquée par la politique des
sockets de l'environnement.

La migration vérifie le contrat partagé avant installation. Le déploiement
doit arrêter les anciens writers de retrait avant d'activer cette nouvelle
route ; leurs anciennes RPC sont laissées intactes pour préserver les autres
consommateurs. Une opération historique ambiguë ou une émission au résultat
inconnu demande un rapprochement avec une preuve fournisseur ; le client ne
provoque aucune réémission pour résoudre cette incertitude. Aucun outil de
rapprochement qui manipulerait de l'argent réel n'a été lancé dans cette recette.

Les journaux restent privés. La projection d'export de données personnelles
est intégrée séparément par le lot d'export, sans ouvrir l'accès direct aux
tables. Le nom de migration sera normalisé avec les autres lots pour éviter
des versions Supabase en doublon.
