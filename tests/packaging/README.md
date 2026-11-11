# Dependency packaging verification

This check covers the application's declared dependencies, candidate lockfile, private source inputs and a real clean installation. Application tests, type checks, lint, build and client-boundary analysis are separate integration gates.

## Baseline and minimal correction

The baseline is upstream commit `ad36ec7b0c70e8e3f7358f904cb2543cc1fd8026`. Immutable copies of its original manifest and lock are retained in the packaging receipts:

| Baseline file | SHA-256 |
| --- | --- |
| `package.json` | `325ed6133c50894890f9530c3816945f509d7640c4bff57c3863b9bcac9a6e6d` |
| `package-lock.json` | `5b7ce47bdc49ae896c47949fe5a849413cba2d5de5010047be85e0d6ef313f5a` |

The candidate adds the exact runtime dependency `@swc/helpers: "0.5.24"`. Standard npm regenerates the lock: helpers `0.5.24` moves from the `next-intl` subtree to the application root, and Next's exact helpers `0.5.15` moves into `next/node_modules`. Every other upstream package entry and resolution is unchanged, including Vite's PostCSS closure and the private SMARANA commit. Both locks contain 812 package entries. No override or legacy-peer-dependency bypass is used.

This declaration fixes a concrete optional-peer placement problem. Under the npm version used here, an entry reached only through SWC's optional peer can be pruned during `npm ci`; its presence in the lock alone does not ensure installation. The stopped third attempt's targeted inventory reported root helpers `0.5.15` invalid for SWC's `>=0.5.17` peer. That incomplete tree is retained as diagnostic evidence. The candidate's completed installation and subsequent inventory establish the corrected effective tree separately.

| Qualified candidate file | SHA-256 |
| --- | --- |
| `package.json` | `9598505dabcff41ea2f5702f1818562671a3bd89895dc58e671dc0d6bc8309a7` |
| `package-lock.json` | `a1f5000379e5c839e2bee99c2c62d8e68df4c959110fd09c3846d11ae9b99903` |

The earlier local candidate's helpers `0.5.17` declaration and its installation are historical evidence. They do not qualify this candidate or replace the upstream dependency resolutions.

## Required private inputs

Supply these sibling package directories before installation:

| Dependency | Required location |
| --- | --- |
| `@purama/antifraud` | `../packages/purama-antifraud` |
| `@purama/entraide` | `../packages/purama-entraide` |
| `@purama/eslint-config` | `../packages/eslint-config-purama` |

`tooling/shared-packages.lock.json` records 18 required runtime/configuration files, their sizes and SHA-256 hashes, at the pinned `purama-master` commit `6e50837af08ad57d8db37077f0363b3e05289e31`. The supplied snapshot matches all 18 entries exactly before and after installation. Its seven additional files are the source packages' internal tests. All 25 files, totaling 67,372 bytes, are unchanged by installation; their identities are retained in private provenance receipts. No Git metadata, environment file or credential is copied into these sibling snapshots.

A `file:` dependency does not freeze source bytes itself. The verification receipt binds both these source files and the installed links. The application repository does not contain copies of the private engines.

The owned layout has a common module-resolution ancestor:

| Location | Role |
| --- | --- |
| `<layout>/app` | Application copy and its installed `node_modules` |
| `<layout>/packages/*` | Supplied private package snapshots |
| `<layout>/node_modules` | Relative link to `app/node_modules` inside this layout |

This ancestor lets the separate ESLint configuration package resolve its ESLint peers from the application installation. The four owned links are recorded, and `require.resolve` from the physical configuration package resolves both declared peers within the owned application modules. This resolution check does not execute lint.

The layout is outside Git metadata because Vite's default filesystem policy rejects paths under `**/.git/**`. Keep that protection enabled when selecting the validation directory. The recorded layout also uses the `.noindex` suffix; the successful protocol changed several operational conditions, so it does not isolate a single cause for earlier timeouts.

`@purama/smarana` requires authorized read access to its private Git repository. The candidate and installed hidden lock retain the original resolution `git+ssh://git@github.com/puramapro-oss/purama-smarana.git#531cc653c81ffa3c99ab94667067f217deb5f944`. The successful native installation uses the existing official `gh` Git credential helper and a process-scoped SSH-to-HTTPS rewrite restricted to that repository. Credentials are not placed in the project or extracted by the verification scripts. CI authentication remains a separate qualification.

The installed SMARANA package manifest and all runtime source files (12 files in total) match the exact commit and tree `ce5c33dfd6d7156aaf8629576c43c30f13400812`. The local Git mirror is used for this byte comparison, not as a substituted resolution for the successful native installation.

## Effective dependency layout

The targeted standard npm inventory accepts Next `16.2.11`, `next-intl 4.13.4`, Vitest `4.1.12`, Vite `8.3.8` and their selected SWC/PostCSS closure.

| Consumer | Installed dependency | Reason |
| --- | --- | --- |
| Application and `next-intl` / `@swc/core 1.15.46` | Root `@swc/helpers 0.5.24` | Explicit runtime dependency; satisfies SWC's `>=0.5.17` peer. |
| Next | `next/node_modules/@swc/helpers 0.5.15` | Next declares this exact version. |
| Next | `next/node_modules/postcss 8.4.31` | Preserved upstream placement. |
| Vite | `vite/node_modules/postcss 8.5.32` | Satisfies Vite's `^8.5.32` requirement. |
| Vite's PostCSS | Nested nanoid `3.3.20` and source-map-js `1.2.2` | Preserved closure of this PostCSS version. |

The pre-existing root PostCSS `8.5.23`, nanoid `3.3.16` and source-map-js `1.2.1` remain unchanged. These distinct placements satisfy different dependency constraints.

## Verification procedure

Begin with an owned application directory containing the exact candidate manifest/lock, supplied sibling packages and no application `node_modules`. Use empty user/global npm configuration, an explicit environment without credential values, a batch-owned cache and the admitted Git authentication mechanism.

```sh
npm ci --ignore-scripts --no-audit --fund=false --prefer-offline \
  --offline=false --maxsockets=1 --fetch-retries=0 --fetch-timeout=15000
npm ls @swc/helpers @swc/core next next-intl vite postcss --all --json
npm ls --omit=dev --all --json
```

Run inventories only after installation has finished successfully. `--prefer-offline` reuses cached packages while permitting missing public archives and authorized Git retrieval; it is not an offline installation. The recorded install uses Node `26.0.0`, npm `11.12.1`, a 4 GiB Node heap, a 600-second execution bound and one gate job. The inventory commands run separately with network access denied and credential stores unreadable. Installation lifecycle scripts, npm audit, funding requests and update notifications remain disabled.

Record the actual Node/npm executable identities, commands, environment policy, sandbox, clean starting state, manifest and lock hashes, private source hashes, installed hidden lock and SMARANA source identity. Preserve timed-out attempts and their incomplete trees separately from successful evidence. A dry run or isolated Git/Pacote extraction does not qualify a complete installation.

## Recorded qualification — corrected candidate, 2026-11-11

| Check | Result | Evidence |
| --- | --- | --- |
| Standard npm lock regeneration | **PASS** | R7, `helper-lock-receipt.json`; only the declared SWC placement changes. |
| Clean native `npm ci` | **PASS** | R8, `corrected-install-receipt.json`; exit 0 in 35.89 seconds, no starting application modules, exact candidate manifest/lock unchanged. |
| Effective SWC/Next/Vite/PostCSS tree | **PASS** | R9, `installed-inventory-receipt.json`; standard `npm ls`, exit 0 and empty stderr. |
| Supplied private inputs and links | **PASS** | `private-packages-noindex-after.json`; all 25 files unchanged, all 18 pinned runtime entries match, four links stay inside the owned layout. |
| Installed SMARANA source identity | **PASS** | `installed-smarana-identity.json`; exact commit, tree, resolution and 12 matching files. |
| Global runtime inventory | **PARTIAL** | `installed-runtime-receipt.json`; `npm ls --omit=dev --all` exits 1 with the diagnostics below. |
| Application tests, types, lint, build and client-boundary analysis | **NOT TESTED by this packaging check** | Separate integration gates use the final application sources. |

The successful installation completed at `2026-11-11T18:10:18Z`. Its installed `node_modules/.package-lock.json` has SHA-256 `4c25e2fccb3147bb66eaddb4daedd62b1c63d299326008c2b2341101b5723ff0` and remained unchanged during inventories.

The global runtime inventory reports five missing development requirements belonging to the sibling engines: antifraud's `@types/node ^20.0.0`, `typescript ^5.6.0`, `vitest ^3.2.6`, and Entraide's `typescript ^5.6.0`, `vitest ^2.0.0`. These package manifests describe independent development/test environments; the application installation does not install those environments.

It also reports `@emnapi/runtime 1.11.2` and `@tybys/wasm-util 0.10.3` as extraneous. Their incoming lock references are associated with optional WebAssembly packages whose manifests are absent from this installed platform tree. The raw diagnostic and static parent-presence evidence are retained. No manual deletion, pruning or additional installation is used to make this global diagnostic appear clean.

Three attempts on the uncorrected upstream lock reached their 180-, 360- and 240-second limits. Their gate logs, raw npm logs, incomplete trees and cleanup observations remain historical failed experiments. The third attempt continued extracting public packages near its time limit. Subsequent isolated native Git and Pacote checks succeeded. These observations do not establish one cause for the earlier timeouts, and the current successful result qualifies the explicitly corrected candidate.

## Application verification

After the packaging freeze, copy the final application sources into the qualified layout and run the existing integrated tests, type checks, lint and Next build. Qualify the client boundary separately to ensure the private Entraide engine contributes no client chunk parts. An analyzer compilation is distinct from inspecting the preceding build's exact output. These local gates do not establish deployment, live authorization or provider connectivity.
