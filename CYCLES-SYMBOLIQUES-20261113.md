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
- TypeScript global : erreur antérieure `src/app/go/[slug]/route.test.ts` non modifiée ; porte de vérification ciblée et régression à conserver distinctes.
- Aucun build complet, déploiement, écriture sur BD distante ou prise d'initiative sur les données de tiers.
