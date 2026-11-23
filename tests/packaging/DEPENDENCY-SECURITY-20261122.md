# AKASHA — qualification des dépendances, 22 novembre 2026

## Résultat et portée

**PARTIEL au niveau de la qualification complète.** Les correctifs de dépendances,
les tests applicatifs, les types, la compilation et les contrôles HTTP locaux sont
vérifiés. L'audit npm réseau reste **BLOQUÉ** et le navigateur reste **BLOQUÉ avant
chargement des pages** dans l'environnement Linux de cette campagne. Aucun
résultat global « zéro vulnérabilité » ni déploiement n'est revendiqué.

Base exacte : `2db2f0c0dad7f753a3e5a3f78f4d1105298ade14` (`main`). Elle contient
déjà la PR 4 `754639a43b40c1f91a9a591bd4ace797462fd56c` via l'intégration
`a2c77c0534cf6fd1e4ea234a49905a2316880b12`. Les anciens travaux ne sont pas
réappliqués. Branche de revue : `fix/akasha-dependency-security-20261122`.

## Correctif

| Élément | Avant dans le verrou | Après |
| --- | --- | --- |
| Next | 16.2.11 | 16.4.6 |
| Configuration ESLint Next | 16.2.2 | 16.4.6 |
| Zod | 4.4.3 | 4.6.7 |
| Sharp / librsvg embarqué | Sharp 0.34.5 | Sharp 0.35.5 / librsvg 2.63.2 vérifié au runtime |
| typescript-eslint | 8.65.0 | 8.73.0 |
| minimatch de typescript-estree | 10.2.5 | 11.0.9 |
| brace-expansion | 1.1.16 / 5.0.8 | 1.1.22 / 5.0.13 |
| js-yaml | 4.3.0 | 4.3.2 |
| nanoid racine | 3.3.16 | 3.3.20 |
| source-map-js racine | 1.2.1 | 1.2.4 |
| PostCSS privé à Next | 8.4.31 | Entrée supprimée par npm ; Next utilise 8.5.23 |

Le manifeste change uniquement `next`, `eslint-config-next` et `zod`. npm a
régénéré le verrou, puis rafraîchi cinq familles transitives ciblées, sans
`audit fix --force`, override de compatibilité ni changement de règle métier.
Le verrou final contient 815 entrées ; 71 entrées diffèrent de la base, y compris
la racine, les paquets natifs de Next/Sharp et les dépendances déplacées.

`next typegen` ajoute l'import généré `./.next/types/root-params.d.ts` dans
`next-env.d.ts`. `vercel.json` ajoute uniquement
`git.deploymentEnabled["fix/akasha-dependency-security-20261122"] = false` ; toutes
ses autres clés, y compris l'installation existante, sont inchangées.

## Sources privées et installation

**PASS identité** : les 18 fichiers partagés restent conformes, en taille et
SHA-256, à `tooling/shared-packages.lock.json`, commit
`6e50837af08ad57d8db37077f0363b3e05289e31` de `puramapro-oss/purama-master`.
Les 12 fichiers SMARANA correspondent à leurs blobs Git du commit
`531cc653c81ffa3c99ab94667067f217deb5f944` de
`puramapro-oss/purama-smarana`, avant installation et après installation.
Les huit entrées privées du verrou, ainsi que les déclarations du manifeste,
sont inchangées.

La qualification Linux emploie une copie du manifeste/verrou dans un dossier
frère `qualification`, avec une archive locale des 12 blobs SMARANA vérifiés.
Seules la déclaration d'acquisition de ce paquet et son entrée résolue changent
dans cette copie. Les 815 entrées, leurs versions publiques et les transitifs
privés restent identiques au verrou produit. Cette substitution ne figure pas
dans le dépôt et **ne qualifie pas le transport Git privé authentifié**.

`npm ci --ignore-scripts --no-audit --no-fund` y installe 675 paquets. La reprise
`npm rebuild --no-audit --no-fund` sort à 0 ; npm 11.19.1 laisse toutefois les
postinstall de `@parcel/watcher@2.6.0`, `@swc/core@1.15.46` et
`unrs-resolver@1.12.2` en attente d'approbation. Cette campagne ne les active pas.
Les modules utilisés par les tests, le lint et le build ont fonctionné avec les
binaires installés. Le rendu Sharp natif est vérifié séparément.

## Résultats réellement exécutés

Runtime : Linux x64, Node 24.22.3, npm 11.19.1, TypeScript 5.9.3,
Vitest 4.1.12, Playwright 1.61.1, React/React DOM 19.2.4. La CI publiée garde son
runtime Node 24.22.1 ; elle n'est pas remplacée par ce résultat local.

| Contrôle | Résultat | Portée |
| --- | --- | --- |
| Préparation des sources et garde des accès privés | **PASS, 31/31** | Deux suites Node existantes, réexécutées sur le candidat final |
| `npm test` | **PASS, 656/656 dans 37 fichiers** | Suite intégrée existante ; aucun cas ignoré ou supprimé |
| Garde source Stripe | **PASS, 7/7** | `stripe-webhook-idempotent-no-swallow.spec.cjs` |
| Répartition Karma | **PASS, 14/14** | Fonctions pures exécutées par Playwright ; aucun navigateur requis |
| `next typegen`, puis TypeScript complet | **PASS** | `tsc --noEmit --incremental false` |
| Lint CI sur `src` | **PASS avec réserve** | Sortie 0, 0 erreur et 4 avertissements décrits ci-dessous |
| `npm run build` | **PASS** | Next 16.4.6/Turbopack, 36 s, 117 entrées du manifeste applicatif compilé ; 97 pages statiques générées dans le journal |
| Sharp et `next/og` au runtime | **PASS** | PNG redimensionné, SVG simple décodé, `ImageResponse` rendu et dimensions vérifiées ; librsvg 2.63.2 réellement chargé |
| HTTP sur le vrai serveur Next construit | **PASS, 4 contrôles** | `/cycles` FR/EN : 200, langue/titre/canonique/sources ; page privée : 307 vers login ; chat sans session : 401 |
| Navigateur de sélection de modèle | **BLOQUÉ** | 12 lancements échouent avant toute assertion applicative : socket Unix Chromium refusé (`EPERM`) |
| Navigateur auth et cycles publics | **NON TESTÉ** | Le blocage de lancement commun n'a pas été répété inutilement |
| PostgreSQL natif et fournisseurs réels | **NON TESTÉ dans ce lot** | Les résultats historiques restent séparés |

Les tests intégrés conservent leur doublure SMARANA existante. Les types, la
compilation et le serveur Next utilisent le vrai snapshot privé vérifié. Les
valeurs Supabase, Redis et Stripe de compilation sont synthétiques, les autres
clés applicatives sont retirées de l'environnement, et aucune police simulée
n'est injectée. Le test HTTP ne constitue pas un test d'hydratation navigateur.

Le premier essai HTTP, avec serveur et client lancés dans deux environnements
d'exécution séparés, reçoit `ECONNREFUSED`. L'orchestration des deux processus
dans le même environnement local réussit ; le serveur est ensuite arrêté.
Cet essai initial et le lancement Chromium refusé sont conservés dans les reçus.

## Réserves de cohérence et de maintenance

**PARTIEL, `npm ls --all` et `npm ls --omit=dev --all`** : les deux commandes
sortent à 1 avec le même problème Vitest. Les chemins sont précisément :

- `../packages/purama-antifraud` → `devDependencies.vitest: ^3.2.6` ;
- `../packages/purama-entraide` → `devDependencies.vitest: ^2.0.0` ;
- résolution commune du layout de qualification : `../node_modules/vitest`,
  version 4.1.12, identique à celle du verrou initial.

Ces deux plages privées et la version applicative étaient déjà présentes dans
la base. Leur incompatibilité est établie par les déclarations source/verrou ;
aucun `npm ls` de la base n'est présenté comme nouvellement exécuté. L'analyse
indépendante du graphe installé examine 1 626 arêtes, dont 125 arêtes de peer :
seules les deux arêtes **dev** ci-dessus sont invalides. Aucune autre arête
runtime ou peer requise invalide n'est relevée. Cela n'efface pas l'échec de
l'inventaire global. Les sources privées restent figées.

**Maintenance ESLint** : ESLint 9.39.5 est inchangé et satisfait les contraintes
des plugins Next réellement utilisés. La branche ESLint 9 est en fin de support
depuis le 6 août 2026 selon la
[politique officielle](https://eslint.org/version-support/). Passer à ESLint 10
sans migration coordonnée violerait les peers déclarés des plugins import,
React et accessibilité. Le suivi de cette migration reste ouvert.

**Quatre avertissements Next** : la nouvelle règle
`@next/next/no-location-assign-relative-destination` signale `PublishModal`,
`CompteConfigurationPage`, `BillingTab` et `useAuth.signOut`. Aucune règle n'est
désactivée. La déconnexion conserve son rechargement complet ; ce lot de
dépendances ne modifie pas la séparation entre sessions pour supprimer un
avertissement. L'avertissement préexistant de convention `middleware` est aussi
conservé : passer à `proxy` change le runtime, selon le guide Next 16.

## Comparaison de sécurité hors ligne

Le contrôle automatique d'autorisation a refusé l'envoi à npm d'un inventaire
dérivé du verrou privé, y compris une projection publique. Cet audit réseau
reste **BLOQUÉ**, sans nouvel essai ni endpoint alternatif.

La comparaison locale réunit les corpus déjà disponibles d'AKASHA et KALA :
**54 couples distincts paquet/avis/plage**, comparés à toutes les occurrences
du verrou avec `semver.satisfies(..., { includePrerelease: true })`.
**38 correspondances dans la base, aucune dans le candidat final**. Cette
couverture est bornée aux corpus retenus ; elle ne détecte pas les avis absents,
ne remplace pas un audit du code privé et ne garantit pas l'absence de défaut.

Sources primaires examinées pour les choix de versions :

- [Next 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6),
  [ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) et
  [cookies middleware](https://github.com/advisories/GHSA-f3mh-rxg3-f5g2) ;
- [Zod, correction 4.6.6](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) ;
- [Sharp, correction 0.35.5](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) ;
- [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
  [js-yaml](https://github.com/advisories/GHSA-2883-xcg3-v3hh),
  [nanoid](https://github.com/advisories/GHSA-2v37-7h3g-55p8),
  [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) et
  [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Commandes de reproduction

Après l'acquisition privée autorisée et vérifiée décrite dans le README de
packaging, les commandes applicatives restent celles de la CI existante :

```sh
node --test scripts/bootstrap-shared-packages.test.mjs scripts/install-private-dependencies.test.mjs
npm test
node tests/stripe-webhook-idempotent-no-swallow.spec.cjs
node node_modules/@playwright/test/cli.js test tests/v71-karma-split.spec.ts --workers=1 --retries=0
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint -- --config eslint.config.mjs src
npm run build
```

La génération et le build nécessitent les paramètres synthétiques de la CI
pour une qualification locale. Les reçus de cette campagne conservent la
commande exacte, le répertoire, le code de sortie, la durée et le journal, avec
les empreintes des fichiers examinés. Les comptes des suites ci-dessus restent
distincts ; les essais historiques ne sont pas additionnés.

### Reprise navigateur macOS — procédure préparée, non exécutée

Préconditions : copie isolée au commit exact à qualifier ; mêmes versions du
verrou ; sources privées vérifiées ; Chrome disponible au chemin déjà déclaré
dans les configurations ; port 51066 libre. Le profil d'exécution doit être
validé pour refuser les sorties réseau externes tout en autorisant le TCP
loopback et l'IPC local temporaire de Chromium. Aucun profil personnel Chrome
n'est utilisé. Le réseau des processus doit être restreint en plus du filtrage
des requêtes déjà présent dans les tests.

Dans cette copie, avec un dossier de résultats propre et une seule commande à
la fois, sous ce profil validé :

```sh
AKASHA_UI_TEST_OUTPUT=../evidence/browser-model-mac \
  node node_modules/@playwright/test/cli.js test \
  --config tests/model-selection/browser/playwright.config.mts --workers=1 --retries=0

AKASHA_UI_TEST_OUTPUT=../evidence/browser-auth-mac \
  node node_modules/@playwright/test/cli.js test \
  --config tests/model-selection/browser/auth.playwright.config.mts --workers=1 --retries=0
```

La première commande comprend **12 scénarios** sur un harnais Vite/HTML qui
importe les vrais `ChatPage`, `ToolsPage`, `ModelSelector` et `useChatMessages`.
La navigation Next, les hooks de session/conversations/quota/voix et Supabase
sont simulés ; les réponses SSE sont contrôlées. Seule l'origine
`http://127.0.0.1:51066` est admise par le filtrage navigateur.

La seconde comprend **6 scénarios** en mode `auth-recovery` : le vrai `useAuth`
est rétabli et Supabase reste une doublure contrôlée. Le serveur Vite utilise
`strictPort: true` et `reuseExistingServer: false`. Ces deux commandes ne
qualifient pas le serveur Next construit. Les **4 scénarios** de
`tests/cycles-public.spec.ts` nécessitent séparément le vrai serveur Next local,
`CYCLES_E2E_BASE_URL` défini sur cette origine, un navigateur admis et le même
refus des fournisseurs externes ; ils restent non exécutés dans cette campagne.

## Analyse d'impact

GitNexus 1.6.12 utilise un registre et un index propres à cette copie, sans
redéfinir `HOME` ni modifier un index partagé. Indexation : 7 233 nœuds,
14 577 arêtes, 293 parcours rapportés. L'outil signale des budgets de parcours
tronqués et une extension FTS indisponible. Les demandes d'impact sur
`middleware` et `UpdateProfileSchema` renvoient **UNKNOWN**, faute de liens
appelants résolus ; ce résultat ne signifie pas absence d'utilisation. Aucun
symbole applicatif n'est modifié. La détection des changements avant commit
est conservée séparément dans les reçus finaux.
