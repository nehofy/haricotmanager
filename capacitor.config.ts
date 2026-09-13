import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Identifiant unique de l'app (format inversé de domaine). Ne plus changer
  // une fois publié/installé quelque part : Android le traite comme l'identité
  // de l'app (mises à jour, données locales, etc.).
  appId: "com.silextech.haricotmanager",
  appName: "HaricotManager",
  // Sortie du build Vite existant — inchangé, on ne fait qu'emballer ce dossier.
  webDir: "dist/public",
  server: {
    // Sert les fichiers locaux sous https://localhost — évite les soucis
    // Mixed Content / IndexedDB / Service Worker liés au scheme file://.
    androidScheme: "https",
  },
};

export default config;
