# PromptCam

Application de prompteur vidéo Angular + Capacitor pour iOS, Android, téléphone et tablette.

## Fonctionnalités

- caméra frontale et microphone, aperçu miroir désactivable ;
- décompte 3–2–1, chronomètre et enregistrement vidéo ;
- prompteur fluide, vitesse et taille du texte réglables ;
- scripts sauvegardés localement, sans inscription et sans serveur ;
- version gratuite limitée à 280 caractères (environ 4 à 5 phrases) ;
- Premium illimité avec achat et restauration RevenueCat ;
- aperçu, suppression, sauvegarde et partage natif de la vidéo ;
- export réel dans l’album **PromptCam** de la galerie Android et dans **Photos** sur iOS ;
- interface responsive basée sur le design fourni.

## Lancer le projet

Prérequis : Node.js 22, Android Studio pour Android, et macOS + Xcode pour iOS.

```bash
npm install
npm start
```

La caméra du navigateur requiert `localhost` ou HTTPS.

```bash
npm run sync
npm run android
npm run ios
```

`npm run sync` compile Angular puis copie le front et synchronise tous les plugins dans les projets natifs.

## Configuration RevenueCat

Les identifiants choisis dans ce guide doivent être repris exactement :

- entitlement RevenueCat : `premium`
- offering RevenueCat : `default`
- produit Apple : `promptcam_premium_monthly`
- produit Google Play : `promptcam_premium_monthly`
- durée : 1 mois
- prix de base : 9,99 € (les boutiques déterminent les prix localisés)

### 1. Apple App Store Connect

1. Créer l’app iOS avec le Bundle ID `com.beyealioune.promptcam`.
2. Dans **Business**, accepter le contrat Paid Applications, puis compléter banque et fiscalité.
3. Dans l’app, ouvrir **Monetization > Subscriptions**.
4. Créer un groupe `PromptCam Premium`.
5. Créer un abonnement auto-renouvelable :
   - Reference Name : `PromptCam Premium Monthly`
   - Product ID : `promptcam_premium_monthly`
   - Duration : `1 Month`
   - prix : sélectionner le palier correspondant à 9,99 € ;
   - ajouter le nom, la description et la capture de revue.
6. Dans **Users and Access > Integrations > In-App Purchase**, créer une clé In-App Purchase et télécharger le fichier `.p8`. Il ne se télécharge qu’une fois.

### 2. Google Play Console

1. Créer l’app Android avec le package `com.beyealioune.promptcam`.
2. Envoyer au moins une version signée dans la piste **Internal testing** ; Google exige une build avant de rendre les produits testables.
3. Ouvrir **Monetize > Products > Subscriptions** et créer `promptcam_premium_monthly`.
4. Ajouter un base plan :
   - ID conseillé : `monthly`
   - renouvellement automatique ;
   - période : mensuelle ;
   - prix France : 9,99 €.
5. Activer le produit et le base plan.
6. Dans Google Cloud, activer **Google Play Android Developer API**, créer un service account, télécharger son JSON, puis donner à ce compte les droits financiers/commandes nécessaires dans **Play Console > Users and permissions**.

### 3. Tableau de bord RevenueCat

1. Créer un projet `PromptCam`.
2. Ajouter l’app iOS avec `com.beyealioune.promptcam`, puis fournir les informations Apple demandées (clé `.p8`, Key ID et Issuer ID).
3. Ajouter l’app Android avec `com.beyealioune.promptcam`, puis importer le JSON du service account Google.
4. Importer ou créer `promptcam_premium_monthly` dans chaque app.
5. Créer l’entitlement `premium`.
6. Attacher les deux produits mensuels à cet entitlement.
7. Créer l’offering `default`, le rendre **Current**, ajouter le package `$rc_monthly` et y attacher les produits correspondants.
8. Copier dans **Project settings > API keys** les clés publiques SDK :
   - clé Apple commençant généralement par `appl_` ;
   - clé Google commençant généralement par `goog_`.

### 4. Emplacement exact des clés

Modifier [src/environments/environment.ts](src/environments/environment.ts) :

```ts
revenueCat: {
  appleApiKey: 'appl_VOTRE_CLE_PUBLIQUE',
  googleApiKey: 'goog_VOTRE_CLE_PUBLIQUE',
  entitlementId: 'premium',
}
```

Ces clés publiques SDK peuvent être incluses dans l’application. Ne jamais placer le fichier privé Apple `.p8`, le JSON du service account Google ou une clé secrète RevenueCat dans ce dépôt.

Après modification :

```bash
npm run sync
```

### 5. Tests des achats

- iOS : créer un utilisateur Sandbox dans App Store Connect, lancer depuis Xcode sur un appareil, puis acheter avec ce compte Sandbox.
- Android : ajouter les testeurs à la piste Internal testing et dans **Settings > License testing**, installer l’app depuis le lien Play de test, puis effectuer un achat test.
- Vérifier dans RevenueCat que le client anonyme possède l’entitlement `premium`.
- Tester **Restaurer mes achats**, l’expiration, l’annulation et le mode hors ligne.

L’application n’appelle pas `logIn` : RevenueCat crée donc un identifiant anonyme par installation, conformément au fonctionnement sans inscription demandé. La restauration permet de récupérer l’abonnement via le compte App Store ou Google Play.

## Publication

### Android

```bash
npm run sync
npx cap open android
```

Dans Android Studio : configurer une clé de signature, incrémenter `versionCode`/`versionName`, puis **Build > Generate Signed Bundle / APK > Android App Bundle**. Envoyer le `.aab` dans Play Console.

### iOS

```bash
npm run sync
npx cap open ios
```

Sur macOS/Xcode : sélectionner la Team, vérifier le Bundle ID, incrémenter version/build, choisir **Any iOS Device**, puis **Product > Archive > Distribute App**.

## Sécurité et données

- aucune inscription et aucun texte envoyé à un serveur applicatif ;
- scripts et réglages stockés localement avec Capacitor Preferences ;
- clés privées des stores absentes du code ;
- achats validés par les stores et RevenueCat ;
- permissions caméra/micro demandées par les systèmes mobiles ;
- aucune vidéo conservée si l’utilisateur choisit Supprimer.

## Vérifications

```bash
npm run build
npm test
npx cap sync
```
