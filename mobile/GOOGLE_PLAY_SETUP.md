# AKASHA AI — Google Play Setup (3 minutes)

## Pre-requis
- Compte Google Play Console ($25 one-time) : https://play.google.com/console
- Service Account JSON (deja configure si Purama setup fait)

## Etape 1 — Creer l'app (1 min)
1. Ouvrir Google Play Console
2. **Toutes les applications** > **Creer une application**
3. Remplir :
   - Nom : `AKASHA AI — 47 Outils IA`
   - Langue par defaut : `Francais`
   - Application : `Application`
   - Gratuit ou payant : `Gratuit`
4. Accepter les conditions > **Creer l'application**

## Etape 2 — Declarations (1 min)
Aller dans **Politique** > **Contenu de l'application** et remplir :

- **Politique de confidentialite** : `https://akasha.purama.dev/politique-confidentialite`
- **Acces a l'application** : `Toutes les fonctionnalites sont accessibles sans restrictions`
- **Annonces** : `Non, mon application ne contient pas d'annonces`
- **Classification du contenu** : Remplir le questionnaire IARC (repondre non a tout)
- **Public cible** : `18+`
- **Application d'actualites** : `Non`
- **COVID-19** : `Non`
- **Securite des donnees** : 
  - Donnees collectees : Email, Nom, Photos (optionnel)
  - Donnees partagees : Aucune
  - Securite : Chiffrement en transit, Suppression possible
- **Application gouvernementale** : `Non`

## Etape 3 — Store Listing (1 min)
Aller dans **Presence dans le Play Store** > **Fiche Play Store principale** :

Les textes sont pre-remplis via `eas metadata:push` depuis `store.config.json`.

Ajouter manuellement :
- **Icone** : `assets/icon.png` (1024x1024)
- **Image mise en avant** : `assets/feature-graphic.png` (1024x500)
- **Captures d'ecran** :
  - Telephone : 4-8 screenshots (depuis Maestro)
  - Tablette 7" : 1-8 screenshots
  - Tablette 10" : 1-8 screenshots

## Etape 4 — Release
EAS gere automatiquement le build et le submit :

```bash
cd mobile
eas build --platform android --profile production
eas submit --platform android --profile production
```

Le build sera soumis en **test interne**. Pour passer en production :
1. Google Play Console > **Production** > **Creer une nouvelle release**
2. Selectionner le bundle depuis le test interne
3. **Examiner la release** > **Lancer le deploiement en production**

## Automatisation
Apres le setup initial, `git push main` declenche automatiquement :
- Build EAS Android
- Submit vers le track interne
- Promotion manuelle vers production (1 clic)

## Commandes utiles
```bash
# Build preview (test interne)
eas build --platform android --profile preview

# Build production
eas build --platform android --profile production

# Submit
eas submit --platform android --profile production

# Metadata push (store listing 16 langues)
eas metadata:push --platform android

# OTA update (sans review)
eas update --branch production --message "hotfix: description"
```

## Troubleshooting
- **Service Account manquant** : Copier `google-service-account.json` dans `mobile/`
- **Build echoue** : Verifier `eas.json` et `app.json` (package, version)
- **Upload rejete** : Incrementer `versionCode` dans `app.json` ou utiliser `autoIncrement: true`
