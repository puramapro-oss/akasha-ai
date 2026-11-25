# Cycles symboliques — AKASHA / IAO (13 novembre 2026)

## Composer sa séance (25 novembre 2026)

Depuis le chat, « Composer ma séance avec IAO » ouvre le parcours existant `/dashboard/cycles`. La personne écrit sa demande, peut reprendre les réglages reconnus en français, les corriger, puis composer localement une séance de 1 à 30 minutes. Une phrase libre reste disponible pour le chat même quand aucun réglage n’a été reconnu.

Les trois modes sont Pratique, Mixte et Spirituel. La durée est répartie entre les pratiques choisies. La personne peut consulter les profections annuelles, l’Horloge cosmique et son nombre de naissance JYOTI avec une seule saisie de date. La numérologie utilise une copie identique de l’export JYOTI épinglé dans `src/lib/jyoti-numerology.ts`. L’âge actuel conditionne l’envoi individuel à IAO depuis cet écran. Un changement de demande ou de réglages invalide la séance préparée et son autorisation de partage. La personne peut calculer son thème natal sur cet écran. La mémoire spirituelle persistante reste un chantier distinct.

Avec Node 24, `npm run test:spiritual` lance les deux simulations locales. `npm test` les exécute aussi avant les tests de régression. Ces simulations évaluent la composition, le respect des réglages, le traitement des dates et le contenu transmis avec accord. Les scénarios Chromium de `tests/model-selection/browser/spiritual-session.spec.ts` utilisent les composants réels et des services de test.

## Thème natal et numérologie dans la séance du 25 novembre

Dans « Ma séance avec IAO », le lien « Explorer mon thème natal · Soleil, Lune et ascendant » mène au calcul sur l’appareil. La date et le fuseau de naissance suffisent pour explorer les signes possibles du Soleil et de la Lune au cours de la journée. L’heure permet de situer dix astres et leurs cinq types d’aspects majeurs, avec un orbe maximal de six degrés. Les coordonnées ajoutent l’Ascendant, le Milieu du ciel et, lorsque l’Ascendant est suffisamment stable, les maisons. En cas de changement d’heure, la personne choisit entre les deux instants possibles ou corrige une heure inexistante. Les journées civiles sautées sont signalées.

Les conventions proposées sont le zodiaque tropical et les zodiaques sidéraux Lahiri et Fagan–Bradley, avec maisons égales ou en signes entiers. La plage de calcul couvre 1900 à 2100. Près d’une limite, le calcul peut présenter deux signes possibles. En région polaire, un Ascendant instable peut empêcher l’affichage des maisons. L’utilisation de l’Ascendant tropical pour les profections fait l’objet d’un choix distinct. Le catalogue de 34 246 villes provient de GeoNames. La recherche s’effectue sur l’appareil après le chargement du répertoire. Une saisie manuelle reste possible.

Une séance mixte ou spirituelle peut aussi accueillir un résumé JSON de numérologie exporté par RISHI. Son aperçu identifie le chemin de vie pythagoricien, le nombre de naissance chaldéen, les chiffres absents dans la grille Lo Shu, le nombre de l’âme tantrique et, si la convention a été choisie, le Kua. La personne choisit d’ajouter ces résultats à sa séance. Le calcul JYOTI reste disponible séparément. Le partage avec IAO requiert l’accord d’envoi du parcours adulte. Le résumé natal dispose en plus de son propre choix de pièce jointe. La demande libre est transmise telle que rédigée.

### Composer selon une envie, une mission ou un repère natal

Dans « Ma séance avec IAO », la personne peut décrire son envie du moment et, si elle le souhaite, formuler sa mission de vie dans ses mots. Elle indique ce qu’elle veut obtenir de la séance : un premier pas, une ébauche ou une décision à éclairer. Les étapes préparées sur l’appareil respectent les pratiques, le temps et le mode choisis. Par exemple, « organiser un atelier d’entraide » avec le choix d’une ébauche produit une invitation à adapter. Des modèles locaux couvrent les rencontres, la musique, l’écriture et les arts visuels. Pour une création hors de ce vocabulaire, le parcours prépare une note d’intention que la personne peut approfondir dans le chat.

En mode mixte ou spirituel, un thème déjà calculé offre une vue d’ensemble et la liste de ses astres, angles, maisons et aspects disponibles. La personne peut explorer une piste précise. L’exercice s’appuie alors sur la question de ce repère. En choisissant la vue d’ensemble, elle peut consulter toute la liste sur son appareil. Le mode pratique utilise les objectifs exprimés. Changer la naissance efface les intentions de la séance. Changer la carte révoque le repère choisi.

Avant l’envoi, l’aperçu présente le message exact. La personne choisit de joindre ses intentions, son repère ou sa synthèse natale complète. Le texte est recomposé avec les seuls éléments autorisés, y compris dans les exercices et les ébauches. La question libre est partagée telle que saisie. La séance n’enregistre pas de profil spirituel permanent.

### Heure estimée et changements d’heure

La personne peut indiquer une marge de ±5, ±15, ±30 ou ±60 minutes. Le même moteur calcule les dix astres et les deux angles à chaque minute entre les bornes, dans la convention zodiacale choisie. Le parcours distingue une heure précise, une heure estimée et une heure inconnue. Pour une heure locale répétée, la personne sélectionne d’abord l’occurrence correcte. Les minutes de la marge représentent ensuite du temps réellement écoulé, y compris quand l’horloge locale change.

La lecture estimée expose seulement les signes observés. Un angle indéterminé à un instant échantillonné reste indéterminé pour la lecture. Si l’ascendant se déplace de 30° ou plus entre deux mesures, sa lecture est suspendue. Le milieu du ciel reste indépendant. Les degrés, maisons et aspects individuels demandent une heure précise dans cette interface. L’ascendant estimé ne remplit pas les profections. La synthèse et les repères choisis portent la mention de l’incertitude jusque dans l’aperçu envoyé. L’échantillonnage à la minute ne certifie pas chaque instant intermédiaire.

Avec une heure inconnue, la lecture du Soleil et de la Lune suit les segments de temps qui appartiennent à la date locale. Cela couvre aussi une date interrompue par un retour d’horloge à la veille. Les régressions couvrent également une heure répétée, une heure inexistante, la plage de dates admise et un retournement de l’ascendant entre deux échantillons polaires.

### Contraintes exprimées pendant la séance

Une demande comme « organiser un atelier de dessin mais seulement en visio » prépare une invitation à distance et demande un créneau. En présentiel, l’invitation demande un lieu accessible. Si la demande mêle des modalités incompatibles, le brouillon garde les mots de l’auteur. Pour une séance silencieuse ou de deux minutes au plus, la réflexion détaillée reste consultable à côté de la pratique chronométrée. Une modification de l’intention ou du repère se répercute dans la séance et dans l’aperçu selon les autorisations choisies.

### Reproduire la comparaison des positions

Le calculateur utilise Astronomy Engine 2.1.19 dans le navigateur. Le générateur Python de références s’exécute à part avec pyswisseph 2.10.3.2. Le test standard utilise les références synthétiques versionnées dans `tests/fixtures/natal-reference.json`. Pour étendre la comparaison dans un environnement de test disposant des dépendances, depuis la racine du dépôt, lancer les commandes suivantes.

```sh
python3 scripts/natal-reference.py --samples 10000 --polar > /tmp/natal-reference-10000.json
NATAL_REFERENCE_FILE=/tmp/natal-reference-10000.json npx vitest run --config tests/model-selection/integrated.vitest.config.mts src/lib/natal-chart.test.ts
```

Les contrôles portent sur les calculs, les conventions, les parcours utilisateur et les données envoyées. L’interprétation proposée reste symbolique. Les autres systèmes de maisons, techniques prévisionnelles, traditions et langues nécessitent leur propre implémentation et vérification.

## Module initial du 13 novembre

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

## Périmètre historique du 13 novembre

1. RISHI est le moteur astronomique existant. Aucun lien fiable Ascendant/RISHI ↔ AKASHA n'est établi par ce changement ; dans la version du 13 novembre, le signe ascendant devait être fourni explicitement ou rester inconnu.
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
