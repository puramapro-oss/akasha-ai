# Rapprochement avec le code local — 10 novembre 2026

Le lot de sélection de modèle PR1 (`2f0c372e8e602a6e031c6f62fad6a586ac296f35`) est ici réutilisé sur la version locale `2af30ba8d6ecc05f1fd3e58125a05b79937c774e`, pas appliqué par remplacement de l'ancien fichier serveur. Les trois libellés d'accessibilité locaux, les modèles configurés dans cette version, le client Anthropic paresseux, le contrôle du propriétaire de la conversation et le signal d'annulation avec délai sont conservés.

## Vérification du rapprochement

- Avant correction : 19/19 tests locaux existants PASS. Avec les 28 cas du donneur : **30 PASS / 17 FAIL**, reproduisant les erreurs de sélection et de substitution.
- Après rapprochement : **47/47 PASS** dans le banc intégré (19 existants + 28 du donneur), sans suppression d'assertion.
- TypeScript complet de l'application : une erreur de fixture `maybeSingle` était présente dans `/go/[slug]`. Son type de retour admet maintenant explicitement le résultat nullable attendu par les quatre tests inchangés. Contrôle complet ensuite PASS, avec la véritable dépendance SMARANA installée.
- Navigateur : **9/9 PASS** avec Chrome 157.0.8103.39 et Playwright 1.61.1. Les pages/composants/hooks sont réels mais le routage Next, la connexion, le quota et le flux fournisseur sont simulés. Ce n'est pas une qualification Next en production.
- La première tentative navigateur a échoué avant chargement des pages : le sandbox privé interdisait le socket Unix de Chrome. Le second profil conserve le refus des sorties réseau externes et autorise seulement le TCP local et l'IPC temporaire local. Les résultats du premier essai sont conservés.
- GitNexus : index privé actualisé sans modifier le registre partagé. Détection finale : 26 fichiers, 70 symboles, 8 parcours affectés, risque agrégé HIGH. Le risque a été signalé avant clôture, le diff produit relu et le seul appel HTTP direct `useChatMessages` contrôlé. Les liens d'entrée HTTP restent partiellement non résolus ; le graphe ne constitue pas une preuve exhaustive. La détection de changements avant commit est consignée séparément.

Versions réelles : `local-toolchain.json`. Aucune installation ni mise à jour de dépendance dans le projet partagé. Les tests unitaires utilisent les fixtures inertes indiquées ci-dessous ; aucune fixture n'est introduite dans le produit.

Commandes du rapprochement (dépendances déjà préparées) :

```sh
node node_modules/vitest/vitest.mjs run --config tests/model-selection/integrated.vitest.config.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/@playwright/test/cli.js test --config tests/model-selection/browser/playwright.config.mts
```

Le banc navigateur utilise un port local réservé pour ce lot, un profil neuf, `reuseExistingServer:false`, un seul worker et aucun retry. Il réutilise Chrome installé ; il ne prend pas le profil personnel du navigateur.

## Limites non levées

Pas de fusion dans le checkout principal, pas de déploiement, pas d'appel fournisseur payant. Build complet Next, installation neuve, prix/quota commerciaux, concurrence du compteur journalier, chemin non streaming SMARANA et parcours authentifié sur Hostinger restent non qualifiés. Le code partagé non enregistré n'est pas incorporé implicitement. Les anciens tarifs et affirmations marketing de l'application ne sont pas modifiés par ce lot de sélection.

---

## Historique du donneur conservé

La section ci-dessous décrit la qualification antérieure sur son propre commit, ses anciennes versions et Firefox. Ses comptes ne s'additionnent pas aux 47 tests et 9 scénarios du rapprochement local.

# Vérification ciblée du choix de modèle AKASHA

Base examinée : `4042ee9d3fc4f9e355b3710f34681cfef8350cc5` de `puramapro-oss/akasha-ai`.

## Périmètre

Les trois cartes de chat existantes transmettent leur alias dans l’URL. Le chat conserve ce choix, refuse explicitement un alias inconnu ou un accès insuffisant à Opus et permet de choisir un modèle accessible sans perdre le brouillon. Le handler `/api/chat` vérifie le même contrat, puis `resolveModel` conserve le modèle demandé jusqu’au streaming.

Les droits existants sont conservés : Sonnet et Haiku accessibles sur le plan gratuit, Opus sur les plans payants déjà connus. Aucun fournisseur, prix ou quota n’est ajouté. L’absence du champ modèle conserve Sonnet dans l’API et le chat ; l’appel direct `resolveModel(undefined, 'free')` conserve son ancien défaut Haiku.

## Résultats observés le 10 novembre 2026

| Contrôle | Résultat | Portée réelle |
| --- | --- | --- |
| Régression sur la base avant modification | 9 échecs, 2 réussites | 11 tests de résolution et de liens catalogue reproduisent les erreurs corrigées |
| Vitest après modification | **28/28 PASS** | Résolveur et véritable handler `/api/chat`, avec frontières externes simulées |
| Playwright après modification | **9/9 PASS** | Firefox 151.0 ; véritables pages outils/chat, `ModelSelector` et `useChatMessages` |
| TypeScript ciblé | **PASS**, sortie 0 | Fichiers modifiés, page outils, dépendances locales et tests ; frontière SMARANA substituée uniquement dans la configuration de test |
| Revue indépendante et `git diff --check` | **PASS** | Aucun défaut introduit identifié dans le périmètre |
| GitNexus 1.6.12 | Risque agrégé **medium** | Index de la base : 6 fichiers, 7 symboles et 5 flux affectés ; cartographie indicative, non exhaustive |

Les 9 scénarios navigateur vérifient le trajet des trois cartes jusqu’au corps de la requête, le refus Opus/gratuit, le brouillon conservé, la correction par sélection d’un autre modèle, la conservation des autres paramètres URL, trois alias invalides, le défaut sans alias et le blocage pendant le chargement de l’authentification.

Les refus serveur ont lieu **avant les écritures métier, le débit du quota journalier et l’appel IA**. L’authentification et le limiteur de fréquence existant sont toujours exécutés en premier ; Opus nécessite ensuite une lecture du profil. Les tests ne prétendent pas supprimer ces opérations.

## Reproduction dans un clone isolé

Ce dépôt ne possède pas de script `npm test` et n’inclut pas Vitest dans son manifeste. La commande `npm ci` a échoué dans l’environnement de contrôle : le paquet SMARANA vient d’un dépôt GitHub privé ; le paquet eslint interne référence également un dossier local absent. Les tests ci-dessous emploient donc des dépendances publiques installées à part, sans modifier le manifeste ni le verrou du produit. Cette préparation ne constitue pas une installation complète de l’application.

À exécuter à la racine d’un **clone de vérification sans `node_modules`** :

```bash
set -eu
test ! -e node_modules
test ! -L node_modules
AKASHA_QA_DIR=$(mktemp -d)
cp tests/model-selection/tooling.package.json "$AKASHA_QA_DIR/package.json"
npm install --prefix "$AKASHA_QA_DIR" --ignore-scripts --no-audit --no-fund
ln -s "$AKASHA_QA_DIR/node_modules" node_modules

./node_modules/.bin/vitest run --config tests/model-selection/vitest.config.mts
./node_modules/.bin/tsc --project tests/model-selection/tsconfig.json --noEmit

PLAYWRIGHT_BROWSERS_PATH="$AKASHA_QA_DIR/browsers" \
  ./node_modules/.bin/playwright install firefox
PLAYWRIGHT_BROWSERS_PATH="$AKASHA_QA_DIR/browsers" \
  ./node_modules/.bin/playwright test --config tests/model-selection/browser/playwright.config.mts
git diff --check
```

Versions d’exécution observées : Node 24.22.1 et npm 11.9.0. Le serveur Vite écoute seulement `127.0.0.1:5187`. Playwright place ses résultats dans un dossier temporaire dédié, jamais dans les historiques `test-results/` suivis du dépôt. Un Firefox préinstallé doit correspondre à la version de Playwright ; `PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH` permet de choisir explicitement un binaire compatible.

### Frontières de test explicites

- Vitest importe le vrai handler, mais remplace l’authentification, la base, le limiteur et le transport IA. L’autre suite importe le vrai résolveur, interdit les appels réseau et remplace SMARANA/Anthropic par des fixtures inertes.
- Le navigateur charge les vraies pages et le vrai hook d’envoi. Son petit adaptateur `next/navigation` simule le routeur avec l’historique du navigateur. Authentification, listes de conversations, quota et voix sont des fixtures ; la réponse `/api/chat` est un flux SSE simulé. Les requêtes hors de l’origine locale sont bloquées. Il ne s’agit pas d’un serveur Next complet ni d’un test de compte réel.
- Le TypeScript ciblé utilise les vraies dépendances publiques. Seule la frontière privée SMARANA reçoit un contrat minimal de test ; sa compatibilité réelle n’est pas certifiée. Aucune fixture n’est importée par le produit ou ajoutée à son `tsconfig.json` principal.

## Limites et intégration

**NON TESTÉ :** build complet Next, authentification et base réelles, déploiement, disponibilité des modèles Anthropic, qualité, latence et coût réels. Les anciens identifiants fournisseur restent inchangés. La validation de la configuration privée reste nécessaire avant intégration.

Le chemin non streaming `askClaude` / `planToTier` conserve son comportement SMARANA existant ; le présent correctif ne garantit pas le respect du choix dans les autres outils. Le prompt système préexistant masque l’origine Anthropic et revendique une supériorité non évaluée ; il n’est pas qualifié par ces tests.

Le clone distant est isolé des travaux locaux du Mac. Les anciens éléments de continuité signalent une branche locale en avance et des modifications non publiées, sans permettre d’en connaître l’état actuel. Comparer ce lot avec le checkout local avant fusion ; aucun historique local, fournisseur ou chantier SMARANA n’est remplacé par ce correctif.
