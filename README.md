# HaricotManager PWA

HaricotManager est une application React installable, en français, conçue pour fonctionner sans connexion. Toutes les données métiers et les images sont stockées localement dans **IndexedDB** via Dexie ; aucun backend n’est utilisé.

## Démarrage local

Exécutez `npm install`, puis `npm run dev` pour le développement. La production se vérifie avec `npm run build` et peut être servie avec `npm run preview`.

## Fonctions incluses

| Domaine | Fonctions |
|---|---|
| Parcelles | Création, suppression, photos base64, rendements, marge et rapport PDF par parcelle. |
| Dépenses | Catégories configurables, pièces jointes photo, total automatique et export CSV. |
| Planning | Modèles d’activités, création automatique à l’ajout d’une parcelle, activités manuelles, états « fait ». |
| Stock | Semences et intrants, unités kg/L/sachets, seuils d’alerte, export CSV. |
| PWA | Manifest, service worker, cache des ressources de l’application, fonctionnement offline après le premier chargement. |

> Les navigateurs web ne permettent pas à une application strictement offline et sans serveur de garantir une notification à heure fixe lorsque l’application est complètement fermée. Les rappels locaux sont donc planifiés pendant que l’application est active ; les tâches dues restent toujours visibles dès sa réouverture.

## Déploiement Netlify en trois étapes

1. Créez un dépôt Git et envoyez-y ce dossier, puis dans Netlify choisissez **Add new site → Import an existing project**.
2. Sélectionnez le dépôt, conservez `npm run build` comme commande de build et indiquez `dist/public` comme dossier de publication.
3. Cliquez sur **Deploy site**. Une fois l’URL HTTPS attribuée, ouvrez-la sur mobile ou PC pour installer l’application depuis le navigateur.

Pour conserver les routes côté client après rechargement, ajoutez au besoin une redirection Netlify de `/*` vers `/index.html` avec le statut `200`.

## Application native Android (APK)

Le code web est inchangé : Capacitor l'emballe tel quel dans un conteneur natif (accès aux notifications planifiées par l'OS, même app totalement fermée — ce que la PWA seule ne pouvait pas garantir, voir plus haut). IndexedDB/Dexie fonctionne sans modification dans la WebView.

**Prérequis** : Node.js, [Android Studio](https://developer.android.com/studio) installé (fournit le SDK Android + Gradle).

**Première installation, une seule fois :**

```bash
npm install
npx cap add android
```

Cela crée un dossier `android/` (projet Gradle natif) à côté de `client/`. Copiez ensuite le son d'alarme dans les ressources natives, requis pour que `sound: "alarm.mp3"` fonctionne dans les notifications planifiées :

```bash
mkdir -p android/app/src/main/res/raw
cp client/public/alarm.mp3 android/app/src/main/res/raw/alarm.mp3
```

**À chaque modification du code, avant de régénérer l'APK :**

```bash
npm run android:sync
```

**Générer l'APK (debug, installable directement, sans Play Store) :**

```bash
npm run android:apk
```

L'APK se trouve ensuite dans `android/app/build/outputs/apk/debug/app-debug.apk` — à transférer sur le téléphone (câble, ou en l'envoyant par WhatsApp/Drive) puis à installer en autorisant « sources inconnues » dans les réglages Android.

Pour un APK de release (signé, plus léger, à distribuer plus largement), ouvrez le projet dans Android Studio avec `npm run android:open`, puis **Build → Generate Signed Bundle / APK**.

