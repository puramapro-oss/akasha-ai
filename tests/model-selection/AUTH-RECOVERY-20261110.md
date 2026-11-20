# AKASHA — réparation des sessions et profils (10 novembre 2026)

## Livraison et limites

Continuation sur le candidat local `11740b1cc95aa753721acc27057ca3333b403486`, lui-même issu du rapprochement `660afd9`. Aucune seconde application ou seconde autorité d'identité créée. Les corrections du chat, la sélection des modèles, les paramètres commerciaux, les dépendances et les protections serveur sont conservés.

Ce lot corrige le cycle de vie client. Il ne modifie aucune politique serveur, aucun rôle en base, aucune clé, aucun domaine ou service de production. Il n'est pas une mise en service commerciale.

## Corrections

- Une session initiale tardive ne peut plus remplacer un événement de connexion/déconnexion plus récent.
- Le profil précédent et ses indicateurs de droits sont retirés immédiatement lors d'un changement d'identité ; toute réponse appartenant à un ancien chargement est écartée.
- Le jeton de session renouvelé est appliqué. Les confirmations répétées d'une même identité ne déclenchent pas de requête de profil supplémentaire déjà en cours ou inutile.
- Les notifications d'authentification restent synchrones ; la lecture du profil démarre après leur retour, dans une tâche séparée. Une seule souscription active par instance du hook, nettoyée au démontage ; aucune boucle dépendant du profil.
- Chargement initial et profil bornés à 15 secondes, erreurs françaises et reprise explicite. Un ancien succès après expiration reste ignoré. Les rafraîchissements manuels concurrents sont départagés par identité de requête.
- Un profil dont l'identifiant, le plan ou le rôle ne correspond pas au contrat attendu ne fournit pas de privilèges d'interface.
- Une déconnexion refusée retourne l'erreur sans supprimer le stockage et les cookies des autres applications. Le SDK reste responsable de ses identifiants. Les exceptions des méthodes de connexion sont ramenées au contrat d'erreur existant.
- Le vrai écran de chat présente l'erreur de connexion, bloque l'envoi tant qu'elle subsiste et propose de réessayer sans rechargement. Le brouillon du même compte est conservé après reprise.

## Résultats réexécutés sur les fichiers figés

| Contrôle | Résultat |
|---|---|
| Ancien hook sur les 21 tests de cycle de vie finaux | 1 PASS / 20 FAIL |
| Suite intégrée finale | 110/110 PASS : 89 précédents + 21 nouveaux |
| Nouveaux scénarios navigateur avec vrai hook et vrai chat | 6/6 PASS |
| Scénarios navigateur précédents, réexécutés | 12/12 PASS |
| TypeScript complet | PASS |
| ESLint sur le lot | PASS, aucun diagnostic |
| Sources figées | 7 entrées produit/tests identiques pendant les vérifications |

Aucun test ignoré ou retry automatique dans les campagnes navigateur. Les passages successifs ne sont pas additionnés. Les anciennes 1 130 validations ONE ne sont pas présentées comme réexécutées ici.

Premiers échecs conservés : le premier banc de tests supposait un localStorage global disponible sous Node 26 ; une fixture de stockage explicite a été ajoutée avant la reproduction causale valide. La première version utilisait abortSignal après single(), ordre incompatible avec les types du SDK installé, et le nouveau fichier de fixture navigateur contenait une accolade manquante. Les erreurs ont été corrigées avant la campagne finale ; aucune assertion métier supprimée pour obtenir le vert.

## Portée technique réelle

Les 6 nouveaux scénarios emploient le vrai useAuth et le vrai ChatPage dans Vite. Supabase, session, profils et autres services sont inertes et synthétiques. Les 12 anciens scénarios gardent leurs propres mocks. Le réseau externe est refusé par le sandbox ; seuls les échanges locaux du navigateur et son IPC sont admis. Aucun compte réel, OAuth, fournisseur IA ou paiement n'a été utilisé.

Versions inspectées : Node 26.0.0, React 19.2.4, Next 16.2.11, Supabase JS/auth-js 2.110.8, SSR 0.10.3 ; les dépendances existantes sont réutilisées. Aucune installation neuve n'est qualifiée. La source installée de auth-js autorise certaines réentrées asynchrones : ce lot ne prétend pas avoir reproduit un deadlock du SDK réel. Il prouve le traitement des courses de session/profil et le retour synchrone du callback applicatif.

Impact initial useAuth : CRITICAL, 45 appelants directs résolus ; avertissement donné avant modification. L'index privé a été rétabli et actualisé avec succès après l'interruption du lot précédent. Il conserve des limites : FTS désactivé, parcours tronqués, résolution partielle. Il ne certifie donc pas l'absence de régression sur les 45 consommateurs. Revue des contrats et typage complet complètent les tests ciblés ; aucune revue indépendante externe n'est revendiquée.

## Réexécution

```sh
node node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/@playwright/test/cli.js test --config tests/model-selection/browser/auth.playwright.config.mts
node node_modules/@playwright/test/cli.js test --config tests/model-selection/browser/playwright.config.mts
```

Les tests navigateur utilisent un profil neuf, un seul worker, le port privé existant avec strictPort et reuseExistingServer:false. Ils ne prennent pas le profil personnel du navigateur.

## Conditions de finalisation globale non levées ici

PARTIEL : intégration au checkout principal et aux applications déployées ; analyse d'impact non exhaustive.
NON TESTÉ : build Next complet, OAuth/session Supabase réels, règles RLS en production, coût/qualité/charge des fournisseurs, appareils physiques.
La remise en ligne, la base de production de référence et la restauration des sauvegardes restent des chantiers distincts. L'opération d'infrastructure précédemment refusée n'a pas été retentée ou contournée. Aucun état public actualisé n'est revendiqué par ce lot.

## Références

- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- https://supabase.com/kb/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
- https://react.dev/reference/react/useEffect

Sources officielles consultées le 10 novembre 2026 ; confrontées au SDK réellement installé. Les preuves locales détaillées et tous les journaux sont dans le dossier adjacent `auth-recovery-20261110-2120`.

Détection finale avant commit : 9 fichiers, 152 symboles et 139 parcours affectés, risque CRITICAL. Ces résultats imposent une intégration contrôlée ; ils ne sont pas présentés comme un feu vert automatique de production.
