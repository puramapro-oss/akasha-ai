# AKASHA — composition Stripe et accès CI
## Objet
Cette révision réunit la branche de qualification applicative `376fd8baedf1e3e91a17f1770797ab9807422b38` et le correctif existant profil/prime `835d603769cd9b727ba52c0ef744d56398efce7a`. Les deux parents sont conservés. La PR de consolidation nº 1 est réutilisée.

Le crédit de prime et la mise à jour du profil étaient encore séparés dans le premier parent. Le second contient déjà le contrat atomique, ses migrations additives, ses reçus et ses contre-tests. Cette composition reprend ces fichiers sans réécrire leurs règles financières.

## Accès aux dépendances
La CI précédente `43098249388` échouait avant installation faute de secrets de lecture. Le mécanisme SSH de MIDAS `c1a231288a9b4f10885a5813cded9b2fb4afabd0` est repris :
- une clé de déploiement distincte, en lecture seule, par dépôt privé ;
- secrets `PURAMA_PACKAGES_READ_SSH_KEY` et `SMARANA_READ_SSH_KEY`, restreints au dépôt consommateur AKASHA ;
- récupération des seuls 18 fichiers autorisés de `purama-master@6e50837af08ad57d8db37077f0363b3e05289e31`, avec contrôle de taille et SHA-256 ;
- pas de checkout des gitlinks historiques sans URL ;
- SMARANA reste verrouillé sur `531cc653c81ffa3c99ab94667067f217deb5f944` ;
- vérification de la clé d'hôte GitHub, absence d'agent SSH et d'identifiant administrateur dans les sous-processus ;
- installation sans scripts puis nettoyage des identités temporaires avant les scripts de cycle de vie.

Les clés existantes MIDAS sont conservées. Aucune valeur secrète ne figure dans le dépôt ou les reçus de qualification. Les métadonnées des deux nouvelles clés AKASHA confirment `read_only=true`.

## Dépendance SQL de test
`@electric-sql/pglite@0.5.16` est déclaré pour les tests existants. Le verrou a été régénéré avec npm 11.12.1 : seules l'entrée racine des dépendances de développement et la nouvelle entrée PGlite changent. Les 811 entrées préexistantes hors racine, les sélecteurs de plateforme et la résolution privée SMARANA sont préservées. Le nombre total d'entrées passe de 812 à 813.

## Qualification locale exécutée
| Porte | Résultat |
| --- | --- |
| Suite applicative composée | 617/617 PASS, 31 fichiers, zéro échec, ignoré ou todo |
| Gardes d'acquisition et d'installation | 31/31 PASS, Git/SSH réels sur fixtures locales inertes |
| Gardes Stripe existantes | 7/7 PASS |
| Génération des types de routes et TypeScript global | PASS après fourniture des 12 blobs SMARANA exacts |
| ESLint sur tout src | PASS, aucune erreur ni aucun avertissement |
| YAML, syntaxe Bash de toutes les étapes et diff | PASS |
| Revue indépendante | Acquisition, nettoyage, périmètre des clés et composition profil/prime examinés ; aucun défaut bloquant relevé dans ce périmètre |

Les contrôles applicatifs locaux utilisent un environnement de validation séparé, avec les versions publiques directes du verrou et les sources privées épinglées. Ce n'est pas une installation propre de l'application. La suite conserve ses doubles de test SMARANA et base ; les tests SQL utilisent PGlite en mémoire, sans serveur PostgreSQL natif.

La première vérification TypeScript signalait uniquement le paquet privé SMARANA absent du runtime de validation. Après acquisition autorisée et comparaison des 12 blobs du commit épinglé, la même commande passe. Ce défaut de préparation n'a pas été masqué par une déclaration de types fictive.

La CI hébergée doit confirmer une installation propre, la suite, le typage, le lint et le build sur le même contenu. Son résultat est attaché à la PR ; un résultat local n'est pas un résultat de CI.

## Frontières de livraison
Les branches `fix/akasha-model-selection-20261110`, `audit/akasha-prime-j1-20261111-2e4cf86` et la composition locale sont explicitement exclues du déploiement automatique Vercel. L'ancien installCommand Vercel n'est pas corrigé par ce lot et ne doit pas être confondu avec le nouveau chemin GitHub Actions.

Aucun paiement, envoi de message, migration de production, démarrage de base, fusion dans main ou déploiement n'a été exécuté pour cette composition. Le journal et la conversion cross-promo restent distincts de la transaction profil/prime. Avant déploiement, les anciens writers doivent être drainés et la base canonique sauvegardée.

Le répertoire historique comporte plusieurs migrations avec le même préfixe de version, notamment en septembre et novembre. Leur installation par le CLI Supabase et l'historique réel de la base ne sont pas qualifiés. Les tests PGlite appliquent les prérequis dans un ordre explicite ; ils ne valident pas `supabase db push`. Aucune identité historique de migration n'a été renommée sans lecture de cet historique.

## Références
- https://github.com/puramapro-oss/akasha-ai/pull/1
- https://github.com/puramapro-oss/midas/blob/c1a231288a9b4f10885a5813cded9b2fb4afabd0/scripts/install-private-dependencies.mjs
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
- https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
