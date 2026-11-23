# Séquences email AKASHA — consentement et confirmation

Périmètre : le cron existant `/api/cron/emails`, ses sept séquences éditoriales
programmées et leur journal de confirmation. Les événements de parrainage,
concours et palier restent hors de ce cron. Aucun envoi réel n'est nécessaire
aux tests ci-dessous.

## Comportement

- Les sept contenus programmés sont des communications éditoriales ou
  promotionnelles. Ils exigent la valeur JSON booléenne `newsletter: true` dans
  la ligne enregistrée de `notification_preferences`. Les valeurs par défaut
  de l'interface, `product_updates` et `weekly_digest` ne valent pas inscription
  à cette séquence. Une ligne absente ou mal formée interdit l'envoi.
- Les refus explicites entrants restent respectés : `product_updates: false`
  bloque aussi `welcome` et `tip_day1`, et `weekly_digest: false` bloque
  `tips_day7`. Ces veto supplémentaires sont vérifiés dans la même admission
  SQL. Ils ne remplacent jamais l'opt-in `newsletter: true`.
- Une pause future `paused_until` interdit l'admission. La fonction SQL relit
  l'adresse actuelle et les préférences sous verrou de lecture après l'attente
  de cadence et avant d'admettre un envoi. Cette réservation constitue l'unique
  admission finale ; un retrait pendant les 550 ms est donc pris en compte.
  Une erreur de lecture ou un reçu incohérent n'autorise aucun envoi.
- Les jours d'inscription utilisent des bornes UTC demi-ouvertes, de minuit
  inclus au minuit suivant exclu. La pagination classe par date de création,
  puis identifiant, avec des pages de 100 et un curseur qui conserve les
  microsecondes PostgreSQL. Même une page courte peut refléter une limite API :
  seule une page vide confirme la fin. L'anti-jointure exclut les reçus existants
  du même type, sans les compter comme une nouvelle acceptation fournisseur.
- Une réservation durable, unique par personne et type, précède l'appel au
  fournisseur. Le jeton de tentative et le SHA-256 du contenu lient sa clôture
  à cette demande. La clé d'idempotence Resend stable est une protection
  complémentaire ; son éventuelle durée de conservation ne conditionne pas
  l'interdiction de rejouer le journal local.
  Son format entrant `akasha-email/<type>/<userId>` est préservé pendant
  la consolidation, pour ne pas changer l'identité fournisseur déjà publiée.
- `sent` compte uniquement une acceptation Resend avec identifiant non vide et
  la confirmation SQL correspondante. La livraison dans la boîte du
  destinataire et la lecture ne sont pas établies.
  Le log historique et la transition vers `sent` partagent une transaction.
- Une erreur fournisseur, une confirmation absente, une réponse perdue ou un
  délai d'attente dépassé conserve la réservation sans expiration ni reprise
  automatique. Le cron renvoie HTTP 503 et un compte rendu partiel ; il ne
  supprime pas la réservation pour renvoyer le message.
- Les anciens `email_sequences` sont préservés. Ils ne prouvent pas une
  acceptation puisque l'ancien handler ignorait certaines erreurs résolues.
  Une entrée historique sans nouveau journal reste à rapprocher pour obtenir
  une preuve fournisseur. L'optimisation de cohorte l'exclut du cron ; un appel
  direct à l'autorité durable la reconnaît comme historique non réémissible.
- Une exécution admet des tentatives pendant 45 secondes au maximum, avec un
  plafond de 75 réservations confirmées et un espacement d'au moins 550 ms.
  Les choix non consentants ne consomment pas ce plafond. Budget et cadence
  sont vérifiés avant la réservation ; une tentative déjà admise poursuit sa
  clôture bornée. L'export Next `maxDuration = 120` laisse 25 secondes de marge
  après les 45 secondes d'admission et les 50 secondes maximales de requêtes de
  la dernière tentative. Cela prépare la configuration ; la durée réellement
  permise par l'hébergement doit encore être vérifiée dans l'environnement.
- Un quota fournisseur interrompt les tentatives restantes. Le compteur
  `reconciliation_required` décrit cette tentative incertaine, sans la compter
  deux fois dans `failed`. `deferred: true` et HTTP 503 signalent le travail
  restant. Une exécution ultérieure peut traiter les autres destinataires du
  même jour ; elle ne réémet pas la tentative déjà réservée.

## Migration et intégration

La migration `20261123010200_email_sequence_delivery.sql` attend les trois tables
existantes `profiles`, `notification_preferences` et `email_sequences`. Elle
ajoute un journal privé et trois fonctions réservées au rôle service.
Les clients anonymes/authentifiés ne peuvent ni les appeler ni modifier le
journal. Même le rôle service ne peut éditer directement ses lignes.

La migration entrante `20261122165000_delivery_consistency.sql` est conservée,
notamment les droits de lecture seule de l'historique `email_sequences`.
La migration durable postérieure retire les droits du rôle service et des
clients sur son ancien `record_email_sequence_delivery`. Sa définition reste
historique, sans second chemin applicatif de confirmation. L'ancien helper
TypeScript de valeurs par défaut est supprimé ; l'admission SQL est l'autorité.
Le nouveau `notification-preferences.ts` reste partagé par les écrans de
réglages ; ses valeurs d'affichage ne sont jamais utilisées pour admettre
une séquence email. La sauvegarde conditionnelle de `useSettingsData` fusionne
uniquement les catégories éditées avec la ligne relue, conserve les clés
inconnues et la pause, et réessaie au plus trois conflits sous le même délai.
Une valeur absente ou NULL affichée par défaut ne crée pas de consentement.

La fixture composée charge le `schema.sql` complet, donc le vrai déclencheur
`handle_new_user`, puis les deux préalables de septembre, les quatre migrations
entrantes `165000` à `165300`, l'extension `20261123010000_reward_boundaries.sql`
et enfin la migration durable `20261123010200`. Les corps entrants restent
inchangés ; l'extension contrôle leurs empreintes avant l'ajout du journal.
Le cas historique est créé avant ce dernier ajout. Les seeds de profil
utilisent un upsert pour respecter le profil déjà créé par le déclencheur.

La migration est une application unique suivie par le mécanisme de migrations
existant. Une réapplication directe échoue volontairement au lieu d'accepter
silencieusement un schéma préexistant de forme inconnue. Les transactions
préservent un état cohérent en cas d'erreur.

L'intégration doit suspendre et drainer l'ancien cron, appliquer la migration
dans l'environnement autorisé, rafraîchir la découverte PostgREST selon la
procédure existante, puis livrer le nouveau handler avant reprise. Un ancien
worker ne consulte pas le nouveau journal et ne doit pas coexister avec ce
protocole. Ces actions de production ne font pas partie de la qualification
locale.

## Rapprochement d'une réponse incertaine

Il n'existe aucun effacement automatique ni renouvellement de réservation.
Un opérateur autorisé doit rapprocher l'identité de tentative, le contenu
haché et la preuve du fournisseur. S'il dispose de l'identifiant d'une
acceptation réellement confirmée, il peut rejouer uniquement
`complete_email_sequence_delivery` avec les mêmes identités pour réparer le
reçu et le log, sans appel d'envoi. Une finalisation déjà confirmée reste
idempotente et refuse un autre identifiant fournisseur. Une ancienne ligne
`legacy_receipt` ne peut pas être convertie par ce mécanisme.

L'absence de preuve fournisseur ne permet ni de confirmer un envoi ni de le
renvoyer. Le rapprochement auprès du fournisseur et les opérations réelles
restent non qualifiés dans cette intervention.

## Tests et limites

```sh
node --max-old-space-size=512 node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts src/lib/email-sequences src/lib/email-route-readiness.test.ts src/lib/email-sequence-policy.test.ts src/lib/email-sequence-delivery.test.ts src/lib/email-cron-pagination.test.ts src/lib/email-final-consent.test.ts src/hooks/preference-lifecycle.test.tsx src/hooks/notification-cas-lifecycle.test.tsx
node node_modules/typescript/bin/tsc --noEmit --project tests/email-sequences/tsconfig.json
node node_modules/eslint/bin/eslint.js src/app/api/cron/emails src/lib/email-sequences src/lib/email-route-readiness.test.ts src/lib/email-sequence-policy.test.ts src/lib/email-sequence-delivery.test.ts tests/email-sequences
```

Les 24 régressions HTTP initiales échouent sur la base avant correctif. Elles
utilisent le vrai SDK Supabase avec transport synthétique. La suite SQL charge
les définitions de tables versionnées et la vraie migration dans PostgreSQL
WASM en mémoire, puis contrôle les permissions et les transactions. La variante
composée inclut tout le schéma, les déclencheurs et les préalables détaillés
ci-dessus ; la variante isolée conserve les trois tables du contrat email. Elle ne
prouve pas la concurrence de sessions natives ni le schéma de production.
Les tests Resend utilisent le SDK installé et interceptent `fetch`, y compris
une acceptation tardive après délai, sans accès réseau. Les anciennes
assertions d'admission et d'échappement HTML restent couvertes.

Neuf régressions SQL supplémentaires vérifient les écritures réellement
persistées face à des déclencheurs qui suppriment une insertion, réécrivent
son identité, empêchent une transition ou retirent le log lors de la dernière
écriture du journal. Les autorisations et confirmations attendent des reçus
cohérents après l'ensemble de ces effets ; une divergence provoque une erreur
et le rollback de la transaction. Le lot email complet compte 103 tests
réussis avant la consolidation entrante, sans cas ignoré. Une contre-vérification indépendante a reproduit les
défauts puis confirmé leur correction. Les tentatives de qualification native
multisession restent bloquées par la politique locale de sockets ; ces tests
WASM ne sont pas présentés comme une preuve de concurrence native.

## Conservation des contrats de la branche entrante

Les cas entrants sont consolidés dans les suites réelles déjà présentes et
dans deux fichiers SQL, sans conserver un second moteur d'autorisation.

| Contrat entrant | Qualification composée |
| --- | --- |
| Catégories désactivées, absence d'opt-in, pause et type inconnu | `email-sequence-policy.test.ts` exécute la vraie admission SQL ; les anciens défauts positifs ne créent plus de consentement. |
| Refus produit/digest explicite | Trois régressions SQL échouent avant ajout des veto, puis doivent passer. |
| Préférences étrangères ou mal formées, pause invalide | SQL et contraintes réelles, sans fonction de politique simulée. |
| Erreurs de lecture des profils, préférences ou historique | `route.test.ts` et les deux suppressions transactionnelles de table dans `email-sequence-delivery.test.ts` ; aucune admission. |
| Erreur fournisseur, identifiant absent, enregistrement refusé et duplication | `route.test.ts` et `provider.test.ts` préservent ces cas et les réponses ambiguës sans réémission. |
| Clé fournisseur stable et journée UTC complète | SDK Resend installé avec transport synthétique, pagination et bornes UTC déjà couvertes. |
| Historique entrant et droits clients | `email-sequence-delivery.test.ts` applique les deux vraies migrations, conserve le reçu historique, refuse l'ancien RPC au service, vérifie la lecture propre et les écritures interdites. |
| Pagination entrante, microsecondes, limite de page côté API, deuxième page refusée | `email-cron-pagination.test.ts` conserve ces cas et vérifie le filtre du vrai SDK Supabase, sans réseau. |
| Budget temps, 75 tentatives, quota fournisseur et reprise | Même suite ; aucune réservation quand le budget est épuisé, clôture d'une tentative admise et aucune réémission incertaine. |
| Consentement modifié pendant la cadence | `email-final-consent.test.ts` vérifie retrait, pause, lecture défaillante et propriétaire contradictoire après l'attente ; seule la réservation SQL finale peut autoriser l'envoi. |
| Éditions concurrentes des préférences | Les deux suites React vérifient les conflits JSON, SQL NULL/JSON null, les nouvelles éditions, les clés inconnues et la reprise bornée sans écraser une autre catégorie. |
| Contenus éditoriaux | Les modèles entrants retirent le coupon non configuré, les témoignages inventés et les observations d'activité non mesurées ; les deux régressions de contenu sont conservées. |
| Accusé RPC booléen/null/texte ou incomplet | `route.test.ts` exige l'identité durable complète et conserve le journal non réémissible. Les mutations réelles des reçus restent couvertes par SQL. |

Les preuves initiales des 28 cas consolidés donnent 24 PASS / 4 FAIL avant
correction : les trois veto et le recorder encore accessible au service.
Deux cas supplémentaires vérifient ensuite les lectures SQL défaillantes.
La qualification finale du code composé est consignée séparément des 103 cas
historiques et des exécutions de la branche entrante.

Le délai borne l'attente applicative ; il n'annule pas un effet fournisseur
déjà commencé. Une préférence modifiée après admission ne peut pas annuler
une opération externe engagée. La planification reste fondée sur le jour
d'inscription : ce correctif n'ajoute pas de campagne de rattrapage des jours
entièrement manqués, ni de nouveau choix d'horaire ou de fréquence. Les modèles
éditoriaux sont repris de `ca2eeec` ; ils renvoient aux offres configurées et
aux paramètres de notification sans coupon ni témoignage inventé. Les prix
et contrats financiers ne sont pas modifiés. La production, les comptes réels
et l'endurance ne sont pas déduits des suites locales.

## Récupération après indisponibilité de l'environnement

Le moteur durable et le contact proviennent du checkpoint versionné. Les
modèles ont retrouvé l'empreinte SHA-256 du gel antérieur ; les sauvegardes CAS
et leurs deux suites sont reprises exactement de l'amont. Les adaptations de
fixtures, de tests et cette documentation ont été reconstruites à partir de
ces sources. Les résultats historiques ci-dessus ne qualifient pas ces
nouveaux octets : cette reconstruction doit passer la CI avant validation.
