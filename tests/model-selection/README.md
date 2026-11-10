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
