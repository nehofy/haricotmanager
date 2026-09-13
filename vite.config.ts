import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Custom Service Worker (client/src/sw.ts) — needed for background alarm
      // scheduling, notification actions ("Fait" / "Reporter 1h"), and the
      // activate-time reschedule of every pending activity. `generateSW` can only
      // produce a pre-baked worker with no room for that logic.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      // Files in /client/public that aren't referenced by the JS/CSS build graph
      // (icons, offline fallback, hero images) must be listed explicitly so
      // workbox precaches them — otherwise they 404 the first time you go offline.
      includeAssets: [
        "favicon.ico",
        "icons/*.png",
        "images/*.{png,jpg,jpeg}",
        "offline.html",
        "alarm.mp3",
      ],
      manifest: {
        id: "/",
        name: "HaricotManager PWA",
        short_name: "HaricotManager",
        description: "Gestion hors ligne de parcelles, dépenses, planning et stocks de haricot.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0f172a",
        theme_color: "#166534",
        icons: [
          { src: "/icons/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        // The SW imports Dexie + app code (for the activate-time reschedule), which
        // pushes it above the plugin's default 2 MiB precache-manifest warning limit.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        // Lets you test install/offline behaviour with `vite dev` too, not just `vite preview`.
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./client/src") } },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Vendor code changes far less often than app code — splitting it out
        // means a future app update doesn't force everyone to re-download
        // Radix UI/Recharts/Dexie again, and shrinks the single 2MB+ chunk
        // Vite was warning about.
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("dexie")) return "vendor-db";
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
          }
        },
      },
    },
  },
});
