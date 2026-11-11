# Réparation du chat AKASHA — 10 novembre 2026

## Périmètre

Continuation du candidat local `660afd93a53ae85bddadbbe72fe822763ff6377e`. Aucun checkout principal, service partagé, DNS, sauvegarde ou fournisseur réel modifié. Les correctifs de sélection de modèle et les protections serveur antérieurs sont conservés.

## Comportements corrigés

- Une ancienne réponse ou un ancien historique ne remplace plus la conversation courante après sélection, effacement ou démontage.
- Verrou synchrone contre le double clic ; pas d'envoi pendant le chargement de l'historique. Annulation du transport lors du changement de conversation.
- Expirations configurées : 15 secondes pour l'historique, 120 secondes pour la réponse. L'attente côté interface se termine aussi quand une frontière simulée ignore le signal d'annulation. Ces seuils ne sont pas des mesures de latence de production.
- Texte partiel conservé en cas de coupure, messages d'erreur explicites, indicateurs de chargement libérés. Un échec de rafraîchissement ne supprime plus une réponse valide.
- Lecture SSE : séparation par ligne vide, LF/CR/CRLF, données multiligne, UTF-8 fragmenté, arrêt au marqueur final ; coupure ou JSON invalide non présentés comme succès. Limites explicites de taille, sans substitution de modèle.
- État du chat et brouillon séparés par identité React ; l'identité absente ne peut pas soumettre depuis cette page. Cela ne qualifie pas l'authentification réelle ni tous les écrans de l'application.

## Preuves observées

| Contrôle | Résultat |
|---|---|
| Ancien hook sur les 22 scénarios finaux inchangés | 1 PASS / 21 FAIL ; candidat restauré après la reproduction |
| Suite intégrée finale | 89/89 PASS : 47 antérieurs, 22 de cycle de vie, 20 de lecture de flux |
| Typage TypeScript complet | PASS avec la dépendance privée installée, sans fixture de type produit |
| ESLint ciblé | PASS, aucun diagnostic sur les fichiers vérifiés |
| Chrome, 12 scénarios | 12/12 PASS, aucun cas ignoré ni retry automatique |
| Comparaison de diff et intégrité des 7 entrées produit/tests | Contrôlées séparément dans les reçus |

Les 20 contrôles de flux incluent un test qui répète toutes les coupures possibles d'un message UTF-8 ; ces répétitions ne sont pas comptées comme des tests distincts. Les campagnes précédentes ne s'ajoutent pas aux 89 tests.

Le premier contrôle navigateur avait été lancé avec un plafond expérimental de 15 s par cas et a été interrompu à 110 s ; des délais ont été dépassés dont un dans beforeEach. La seconde campagne remet le délai Playwright existant de 30 s, conserve les mêmes assertions, 1 worker et zéro retry ; elle est entièrement verte. Les échecs initiaux et le nettoyage du seul serveur Vite privé sont conservés.

## Méthodes et limites

Les tests exécutent les vrais hooks, handlers et composants, avec base, connexion, fournisseur et navigation de test simulés. Le réseau externe est interdit par le sandbox ; le navigateur est limité au réseau local et à son IPC locale. Aucun appel facturé ni activation d'automatisation.

Impacts avant édition : chemin hook → ChatContent → ChatPage examiné, risque LOW sur les symboles résolus ; index antérieur partiellement périmé. L'actualisation privée finale a atteint sa borne de 120 s et reste PARTIELLE. La détection avant commit doit conserver cette limite, les résultats manquants ne sont pas une absence de risque.

NON TESTÉ : build Next complet de ce candidat, compte et fournisseur réels, concurrence du compteur serveur, coût et performance de production, appareils physiques. Les anciennes pannes DNS/Supabase/sauvegardes ne sont pas réparées par cette modification cliente. Le quota serveur historique et le hook d'authentification global sont des périmètres distincts.

## Reproduction

```sh
node node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/@playwright/test/cli.js test --config tests/model-selection/browser/playwright.config.mts
```

Les dépendances existantes sont réutilisées ; aucune installation neuve n'est qualifiée. Journaux et résultats détaillés : dossier `chat-recovery-20261110-2035` adjacent au candidat.

## Références techniques

React — Synchronizing with Effects ; Preserving and Resetting State. WHATWG — Server-sent events, sections Parsing/Interpreting an event stream. Documents officiels consultés le 10 novembre 2026.
