# Cycles symboliques — AKASHA / IAO (13 novembre 2026)

## Objet

Module éducatif autonome ajouté sur une branche isolée, sans nouveau paiement, nouvelle base de données, nouvelle dépendance ni migration.

- `src/lib/symbolic-cycles.ts` : calculs déterministes des profections annuelles par signes entiers et des cycles annuels de l'Horloge cosmique.
- `src/app/(dashboard)/dashboard/cycles/page.tsx` : expérience interactive permettant le calcul sur le terminal du visiteur, puis l'interprétation **optionnelle** par AKASHA.
- `src/lib/symbolic-cycles.test.ts` : références, limites, anniversaires, maîtres traditionnels, consentement.
- L'appel IA réutilise le hook `useChatMessages` et la route `/api/chat` existants, donc leurs mécanismes d'authentification, quota et historique. Aucun changement du chat principal.

## Contrat de confidentialité

Sans accord : date traitée uniquement en navigateur, aucune requête chat déclenchée. Avec accord : envoi d'une description symbolique dérivée (âge, maison et correspondances) et de la question libre, **pas de date de naissance brute**. Le chat persiste les messages déjà prévus par l'application ; il ne faut pas prétendre que toutes les données sont supprimées lorsqu'on désactive l'option locale. Pas de mémoire spirituelle dédiée persistante dans cette livraison.

Le caractère symbolique n'autorise aucune déduction sur convictions, santé, revenu, intelligence, personnalité ou destinée. Pas de profil spirituel des mineurs.

## Sources

- Histoire des profections : https://www.astro.com/astrology/tma_article190314_e.htm
- Horloge cosmique, source interne à la tradition : https://www.ascendedmasterencyclopedia.org/wiki/Cosmic_clock
- CNIL, données sensibles : https://www.cnil.fr/fr/definition/donnee-sensible

## Limites et suites indispensables

1. RISHI est le moteur astronomique existant. Aucun lien fiable Ascendant/RISHI ↔ AKASHA n'est établi par ce changement ; le signe ascendant doit être fourni explicitement ou rester inconnu.
2. La numérologie doit réutiliser JYOTI, sans reprogrammer un second calculateur contradictoire.
3. Avant mémoire persistante SMARANA : consentement explicite séparé, minimisation, politiques de conservation, export/effacement et analyse juridique/RGPD.
4. Vérifier intégration finale dans PURAMA ONE, permissions interapplications et expérience navigateur authentifiée après fusion.
5. L'absence d'Ascendant interdit de produire signe activé et maître annuel. La ligne de l'Horloge cosmique ne dépend pas de l'Ascendant.

## Validation locale

- Vitest de ce module et tests régression chat : exécutés avec succès dans le worktree.
- ESLint sur les nouveaux fichiers : succès.
- TypeScript global : PASS dans la branche actuelle, après alignement avec la base `main` distante.
- Build complet de production : PASS avec Next.js 16.2.11 en mode Webpack et **variables d'environnement fictives et inactives** ; aucun appel au fournisseur de production, aucune base de données modifiée, aucun paiement ni courriel émis. Turbopack standard reste non qualifié dans ce worktree en raison du lien symbolique vers les dépendances.

## Extension contrôlée — 13 novembre 2026 (page publique et partage responsable)

- Page publique `/cycles` : accès sans authentification via une entrée **exacte** dans la liste publique du middleware, métadonnées SEO/Open Graph adaptées à la langue FR/EN, comparaison sourcée des traditions, liens vers le calculateur et les informations de confidentialité.
- Le site dispose déjà d'un service de locales ; cette page utilise FR/EN et un **repli anglais** pour les autres locales. Cela ne constitue pas une traduction de tout IAO en 16 langues.
- Partage via l'API native du navigateur, ou copie de texte et lien ; aucun résultat, naissance, âge, croyance, identifiant ni code affilié inclus. Pas de post automatique, pas de récompense par simple clic ni de preuve inventée de publication. Les paramètres UTM sont uniquement des libellés de campagne.
- Perspective des douze prochaines positions annuelles de cycle, à titre symbolique, calculée à partir d'une seule règle centrale. Elle ne prédit aucun événement.
- Les résultats locaux restent accessibles aux mineurs, mais le partage **individualisé** avec IAO est bloqué dans cette interface pour les moins de 18 ans. L'éligibilité utilise **l'âge actuel**, pas une date de référence passée ou future contrôlée par l'utilisateur. Une défense serveur avant tout profilage persistant restera indispensable.
- Les changements de date ou d'Ascendant réinitialisent l'accord local, les résultats et les réponses affichées. Cette opération ne prétend PAS effacer l'historique déjà persisté par le chat.
- Tests ajoutés : chronologie, partage anonymisé, contenu FR/EN, règles d'accès public/privé, calcul des majeurs et contournement par simulation future.
- Source doctrinale Horloge cosmique : https://www.ascendedmasterencyclopedia.org/wiki/Cosmic_clock/fr ; profections : https://www.astro.com/astrology/tma_article190314_e.htm
- Risque juridique **à vérifier avant tout raccordement automatique à RISHI** : Swiss Ephemeris offre une double licence AGPL / licence professionnelle. Voir https://www.astro.com/swisseph/swephinfo_e.htm ; n'introduire aucune dépendance à ses éphémérides en production sans clarification de licence.

### Limites de qualification

- TypeScript global, ESLint ciblé et 39 tests ciblés : vérifiés localement après les ajouts.
- Tests navigateur réels, exécutés contre `next start` local avec Chrome 157 et variables d'environnement fictives : **4/4 PASS** (FR, EN, mobile 375 px, redirection de la page privée). Les réponses HTTP ont donné 200 pour `/cycles` et 307 pour `/dashboard/cycles` sans authentification.
- **Non testés** : utilisateur réellement connecté et expérience complète du calculateur privé, partage natif sur smartphone, réseau social réel, backend IAO avec compte autorisé, déploiement public, cookies/politique légale finale, confidentialité des données sur infrastructure réelle.
- Ni virality, ni nombre d'utilisateurs, ni taux de conversion garantis. Les mesures futures devront reposer sur événements réels, sans profilage de croyances ou traçage non autorisé.

### Reproduire le test navigateur de découverte

Le fichier `tests/cycles-public.spec.ts` est volontairement **désactivé sans** `CYCLES_E2E_BASE_URL` pour éviter tout test accidentel en production. Sur une instance locale explicite, utiliser `CYCLES_E2E_BASE_URL=http://127.0.0.1:<port> playwright test tests/cycles-public.spec.ts --project=chromium` après installation du navigateur Playwright compatible. Pendant cette session, les quatre scénarios ont été exécutés avec Google Chrome 157 déjà présent (configuration temporaire locale retirée après vérification). Tests de publication sociale réelle non effectués.
