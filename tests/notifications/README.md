# Séquences email : préférences, erreurs et pagination

## Défauts corrigés

La réconciliation prolonge la version publiée `78a4b9d` : budget d'envoi,
pagination sans offset, RPC atomique, relecture du reçu et clé d'idempotence sont
conservés. Les nouveaux contrôles portent sur un choix changé pendant le délai
du fournisseur, la sauvegarde entre onglets et les contenus non étayés.

La route utilise désormais les mêmes valeurs par défaut que les paramètres :

| Séquence | Préférence |
| --- | --- |
| Bienvenue, astuce du lendemain | `product_updates` |
| Conseils du septième jour | `weekly_digest` |
| Relance J3, offres J14, idées J21, retour J30 | `newsletter`, désactivée par défaut |

Le propriétaire, les préférences et la pause sont contrôlés avant l'attente,
puis relus immédiatement après ce délai et avant le fournisseur. Un abonnement
retiré pendant l'attente empêche donc l'envoi. Une erreur de lecture ou une ligne
d'un autre compte reste un échec explicite. Les valeurs par défaut sont partagées
avec l'interface ; `newsletter` nécessite une activation explicite.

La pagination publiée est conservée : tri `created_at` puis `id`, microsecondes
préservées dans le curseur et exclusion SQL des reçus déjà enregistrés. Une page
courte peut provenir d'une limite serveur ; seule une page vide termine la
sélection. Les bornes restent `[début UTC, début UTC du jour suivant[`.

Le champ `sent` compte les nouveaux journaux confirmés. Les reprises confirmées
sont comptées dans `skipped`. Une acceptation fournisseur sans reçu durable exact
reste une erreur : le booléen du RPC est suivi d'une lecture du même utilisateur
et de la même séquence. La clé publiée `akasha-email/<séquence>/<utilisateur>`
est conservée. Le budget limite les tentatives et l'intervalle de traitement ;
une limite ou un quota fournisseur produit HTTP 503 avec `deferred`/`partial`.
Cela ne constitue pas une transaction distribuée avec le fournisseur.

Les contenus ne promettent plus un coupon non configuré, un témoignage inventé,
une activité observée sans mesure ou une récompense pour chaque action. Le pied
de message donne accès aux paramètres de notification. Aucun montant ni tarif
du produit n'est modifié.

## Sauvegarde des préférences entre onglets

L'interface et le serveur partagent les valeurs par défaut. Une sauvegarde
fusionne seulement les catégories effectivement modifiées avec la ligne fraîche.
Le PATCH exige que le JSON `types` soit encore identique à la lecture ; zéro ligne
provoque une nouvelle lecture, dans une limite de trois tentatives et sous le
même délai. Le premier INSERT reprend aussi après un conflit unique.

Les autres catégories, les clés inconnues et `paused_until` restent préservées.
Les anciennes valeurs SQL NULL et JSON null sont traitées explicitement. Un
changement de compte ou une expiration annule la tentative ; une nouvelle édition
effectuée pendant la sauvegarde reste dans le brouillon. Un ancien onglet ne
réactive donc plus une newsletter désactivée ailleurs lorsqu'il change une autre
catégorie.

## Tests reproductibles

```bash
npm test -- src/lib/email-route-readiness.test.ts \
  src/lib/email-sequence-delivery.test.ts src/lib/email-sequence-policy.test.ts \
  src/lib/email-cron-pagination.test.ts src/lib/email-final-consent.test.ts \
  src/hooks/preference-lifecycle.test.tsx src/hooks/notification-cas-lifecycle.test.tsx
```

- Les suites existantes de configuration, de contact, de contenu et de livraison
  sont conservées. La suite de pagination garde le transport réel du SDK et ses
  curseurs exacts ; son seul compteur adapté inclut la nouvelle lecture finale.
- `email-final-consent.test.ts` reproduit quatre changements pendant l'attente
  (désactivation, pause, lecture refusée et propriétaire contradictoire), ainsi
  que les deux contenus non étayés. Ces six cas échouent sur `78a4b9d` avant le
  correctif. Aucun transport réseau ou socket n'est autorisé dans ces tests.
- Les deux suites de préférences contrôlent l'édition, les conflits conditionnels,
  l'annulation, les clés inconnues, le SQL NULL/JSON null et les modifications
  conservées pendant une sauvegarde, avec le vrai client et des réponses HTTP
  contrôlées.

## Limites de la preuve

Ces tests ne prouvent pas la réception dans une boîte mail. L'idempotence Resend
est limitée à la durée de conservation annoncée par le fournisseur : 24 heures,
selon sa [documentation](https://resend.com/changelog/idempotency-keys). Elle ne
forme pas une transaction avec PostgreSQL et ne garantit pas un envoi unique
indéfiniment. La pagination ne constitue pas un test de charge ni un mécanisme
de reprise durable au-delà de la durée maximale d'une invocation.

La configuration `vercel.json` de cette révision ne planifie pas cette route ;
elle planifie seulement la suppression des comptes. Aucun calendrier d'envoi,
appel fournisseur réel, nouvelle campagne ou migration de production n'est
activé par ce correctif. Les trois modèles événementiels présents dans la route
restent hors de la boucle des sept séquences temporelles.
