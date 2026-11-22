# Séquences email : consentement durable et préférences concurrentes

## Admission et confirmation

Le cron utilise un seul protocole d'envoi : `claim_email_sequence_delivery`,
puis l'appel fournisseur et `complete_email_sequence_delivery`. L'ancien
`record_email_sequence_delivery` est conservé dans la migration historique,
mais ses droits d'exécution sont retirés par l'overlay durable. Le helper de
valeurs par défaut sert à l'affichage des réglages ; il n'admet aucun envoi.

| Séquence | Consentement enregistré obligatoire | Veto supplémentaire |
| --- | --- | --- |
| Bienvenue, astuce du lendemain | `newsletter: true` | `product_updates: false` |
| Conseils du septième jour | `newsletter: true` | `weekly_digest: false` |
| Relance J3, offres J14, idées J21, retour J30 | `newsletter: true` | Aucun autre consentement n'est déduit |

La pause `paused_until`, le destinataire et les préférences sont relus par
l'autorité SQL après l'espacement de 550 ms, au moment de réserver la tentative.
Un choix retiré pendant cette attente empêche donc l'admission. Une ligne
absente, une erreur de lecture ou un reçu contradictoire n'autorise aucun
appel fournisseur. Il n'existe pas de seconde politique TypeScript active.

La pagination conserve le tri `created_at` puis `id`, les microsecondes du
curseur et l'exclusion SQL des reçus déjà enregistrés. Une page courte peut
provenir d'une limite serveur ; seule une page vide termine la sélection.
Les journées utilisent les bornes `[début UTC, début UTC du jour suivant[`.

`sent` exige un identifiant fournisseur non vide et le reçu durable exact de
la même tentative et du même contenu. Les deux écritures finales sont relues
après leurs déclencheurs ; une divergence annule la transaction SQL. La clé
`akasha-email/<séquence>/<utilisateur>` reste stable. Une erreur, un timeout
ou une confirmation perdue garde la réservation sans expiration ni réémission
automatique. La durée de rétention de la clé fournisseur ne remplace pas ce
verrou durable. Une réponse incertaine exige un rapprochement autorisé.

Le budget admet au plus 75 tentatives confirmées pendant 45 secondes ; les
candidats non consentants ne consomment pas ce plafond. Une tentative admise
poursuit ses attentes bornées. `maxDuration = 120` conserve une marge après
les 50 secondes maximales de requêtes de la dernière tentative ; les limites
effectives de l'hébergement restent à vérifier. Un quota ou un travail différé
produit HTTP 503 avec un état partiel. Cela ne constitue pas une transaction
distribuée avec le fournisseur.

Les modèles issus de `ca2eeec` retirent le coupon non configuré, les témoignages
inventés, les activités prétendument observées et la promesse d'une récompense
à chaque action. Le pied de message ouvre les paramètres de notification.
Aucun montant ni tarif du produit n'est modifié.

## Sauvegarde des préférences entre onglets

Une sauvegarde fusionne seulement les catégories effectivement éditées avec
la ligne fraîche. Le PATCH exige que le JSON `types` corresponde encore à
cette lecture ; zéro ligne provoque une nouvelle lecture, au plus trois fois
sous le même délai. Un INSERT concurrent revient aussi à une lecture fraîche
après une violation d'unicité. Aucune édition ne signifie aucune écriture.

Les autres catégories, les clés inconnues et `paused_until` sont conservées.
Les valeurs SQL NULL et JSON null sont traitées explicitement. Un changement
de compte ou une expiration annule la suite de la tentative ; une édition
plus récente effectuée pendant la sauvegarde reste dans le brouillon. Les
valeurs d'affichage absentes ne deviennent jamais un consentement enregistré.

## Tests reproductibles

```bash
node --max-old-space-size=512 node_modules/vitest/vitest.mjs run \
  --config tests/model-selection/integrated.vitest.config.mts \
  src/lib/email-sequences src/lib/email-route-readiness.test.ts \
  src/lib/email-sequence-delivery.test.ts src/lib/email-sequence-policy.test.ts \
  src/lib/email-cron-pagination.test.ts src/lib/email-final-consent.test.ts \
  src/hooks/preference-lifecycle.test.tsx src/hooks/notification-cas-lifecycle.test.tsx
```

- Les suites de configuration, contact, contenu, fournisseur et livraison sont
  conservées. La pagination utilise aussi le vrai SDK avec transport synthétique.
- `email-final-consent.test.ts` vérifie quatre changements pendant l'attente
  (retrait, pause, lecture refusée et propriétaire contradictoire), puis les
  deux contenus non étayés. Le claim final doit suivre cette attente ; aucun
  appel à l'ancien recorder n'est autorisé.
- La suite SQL composée charge le schéma complet, ses vrais déclencheurs,
  deux préalables de septembre, les quatre migrations entrantes inchangées,
  l'extension des limites de droits et l'overlay durable email. Elle conserve
  l'historique et vérifie qu'il n'existe qu'un writer applicatif actif.
- Les deux suites React contrôlent l'édition, les conflits conditionnels,
  l'annulation, les clés inconnues, SQL NULL/JSON null et les modifications
  conservées pendant une sauvegarde, avec le vrai client et un transport contrôlé.

## Limites de la preuve

Les modèles et les trois fichiers CAS ont été récupérés avec leur identité
versionnée. Les adaptations de tests, la fixture composée et cette notice
ont été reconstruites après l'indisponibilité de l'environnement d'exécution.
Cette reconstruction n'hérite pas d'un statut PASS des essais antérieurs :
la CI doit qualifier les sources composées et leurs nouveaux octets.

Ces suites ne prouvent ni la réception en boîte mail, ni les sessions PostgreSQL
natives, ni la production ou la charge. Aucun fournisseur réel, calendrier,
migration en production ou nouvelle campagne n'est activé. Les trois modèles
événementiels factorisés restent hors des sept séquences temporelles. Une
préférence modifiée après admission ne peut pas annuler un effet fournisseur
déjà commencé. Aucun rattrapage automatique des journées manquées n'est ajouté.
