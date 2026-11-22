# Contact AKASHA — enregistrement confirmé et notifications distinctes

## Contrat vérifié

La route attend un identifiant UUID et les quatre champs exacts renvoyés par
l'insertion de `contact_messages`, puis relit ce contenu par identifiant après
commit avant tout appel email. Cette seconde lecture couvre les déclencheurs
AFTER qui réécrivent ou suppriment la ligne après le résultat `RETURNING`.
Une erreur résolue de la base,
une exception de transport ou un reçu absent/invalide ne déclenche aucun
email. La réponse distingue les refus avant insertion (`stored: false`) des
résultats d'insertion incertains (`stored: "unconfirmed"`). Le limiteur est
également fermé si son stockage échoue ou si le SDK installé renvoie
`success: true` avec `reason: "timeout"`. Son attente locale est limitée à 2 s,
avant toute insertion ; une admission reçue tardivement ne relance pas le flux.

Après un enregistrement confirmé, HTTP 200 signifie que le contact est
enregistré. `message_id` est la référence retournée par la base. Les champs
`emails.team` et `emails.confirmation` indiquent séparément `accepted` ou
`unconfirmed`. `accepted` exige une réponse du fournisseur sans erreur et un
identifiant non vide ; il ne prouve ni livraison en boîte ni lecture.
Les exceptions, erreurs résolues, réponses partielles et délais email ne
transforment pas le contact enregistré en échec d'enregistrement.

Chaque email a une attente applicative maximale de 20 secondes et une clé
d'idempotence liée au contact enregistré et à sa destination fonctionnelle.
Les deux notifications sont tentées indépendamment, sans reprise automatique.
Cette attente ne peut annuler un effet déjà engagé chez le fournisseur.
Les attentes sont bornées à 2 s d'admission, 10 s d'insertion, 10 s de relecture
et 20 s pour les deux emails en parallèle : 42 s au total, avec une marge devant
les 45 s du client. L'export Next `maxDuration = 60` prépare une durée cohérente,
sans attester à lui seul les limites réelles de la plateforme d'hébergement.

Le formulaire utilise un verrou synchrone avant toute requête. Deux événements
de soumission dans le même rendu React produisent une seule requête. Il attend
une preuve d'enregistrement, affiche la référence et les deux états email,
puis efface les champs soumis et retire le formulaire. Une action explicite
« Écrire un autre message » rouvre un formulaire sans nouvelle requête.
Les réponses perdues ou mal formées conservent
le brouillon et présentent une incertitude d'enregistrement. L'attente du
navigateur est limitée à 45 secondes ; aucune seconde requête n'est lancée
automatiquement. Le démontage du formulaire ignore les réponses tardives.
Aucune promesse de réponse sous 24 heures n'est ajoutée.

## Limites précises

Le verrou client empêche les soumissions simultanées de cette instance du
formulaire. Il ne rend pas plusieurs POST distincts idempotents. Après perte
d'une réponse, une nouvelle soumission manuelle peut créer un autre contact ;
l'interface demande donc de vérifier avant de renvoyer. La clé du fournisseur
ne résout pas cette limite puisqu'elle dépend de l'identifiant de la nouvelle
ligne. Aucune migration, boîte d'envoi durable ou reprise opérateur n'est
introduite dans ce lot.

Une interruption du processus après l'insertion peut laisser le contact
enregistré sans les emails. Une interruption du navigateur ne prouve pas
l'annulation de l'opération serveur. Les états email de la réponse ne sont
pas un nouveau journal persistant. Les notifications non confirmées peuvent
avoir été acceptées tardivement ; elles ne sont pas rejouées par cette route.

## Reproduction et qualification

```sh
node node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts src/app/api/contact src/app/contact/page.test.tsx src/components/contact-delivery.test.tsx src/lib/email-route-readiness.test.ts
node node_modules/typescript/bin/tsc --noEmit --project tests/contact/tsconfig.json
node node_modules/eslint/bin/eslint.js src/app/api/contact src/app/contact src/lib/email-route-readiness.test.ts --max-warnings=0
```

Les 20 régressions initiales échouent avant le correctif. Le cas supplémentaire
du limiteur résout HTTP 200 avant sa correction alors qu'aucun effet ne devait
être admis. La qualification initiale regroupait 14 cas serveur, 8 cas DOM React
et les 23 assertions existantes d'admission et d'échappement email : 45 tests.
Le vrai SDK Supabase est utilisé avec un transport synthétique local.
Les réponses du fournisseur email sont simulées. Aucun email réel, accès à
une base distante, navigateur réel ou déploiement n'est inclus dans ces preuves.
Les rapports avant/après et le registre de vérification sont conservés dans
le dossier de preuves `evidence/contact` adjacent au checkout.

La seconde consolidation conserve les cinq parcours contact entrants avec le
reçu durable plus précis. Avant correction, les cinq variantes de champs
réécrits passaient à tort et la projection de la requête était insuffisante
(6 échecs/19 tests). La suite PGlite supplémentaire charge le schéma versionné
et les migrations composées : 11 scénarios couvrent les réécritures BEFORE et
AFTER de chacun des quatre champs, les insertions supprimées et la lecture
exacte avant notification. Les tests HTTP couvrent aussi les erreurs de
relecture, les délais et les retours tardifs. Les reprises automatiques du SDK
sur une lecture GET restent des lectures ; aucun POST ou email n'est rejoué.
Les nouveaux totaux sont consignés dans le reçu de consolidation, séparément
des 45 tests historiques. PGlite ne qualifie pas la concurrence native ni
les délais physiques de production.
