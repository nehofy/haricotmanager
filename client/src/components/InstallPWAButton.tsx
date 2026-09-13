import { useEffect, useState } from "react";
import { Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` only when the installability
 * criteria are all met (valid manifest reachable at its href, a 192px + 512px
 * icon that actually load, HTTPS, a registered service worker with a fetch
 * handler). We capture that event once, keep it in state, and trigger it
 * ourselves from a real button — the native mini-infobar is suppressed by
 * calling preventDefault() so we control the UX.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) setInstalled(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      toast.success("HaricotManager est installé sur votre appareil");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;
  // No captured prompt yet (criteria not met, already installed, or unsupported
  // browser e.g. desktop Safari/iOS) — render nothing rather than a dead button.
  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    // The prompt can only be used once; drop it either way.
    setDeferredPrompt(null);
  };

  return (
    <Button
      onClick={handleInstall}
      className="install-pwa-button"
      aria-label="Installer l'application HaricotManager"
    >
      <Download size={16} />
      <span>Installer l'application</span>
    </Button>
  );
}

/** Small confirmation badge you can swap the button for once installed, if desired. */
export function InstalledBadge() {
  return (
    <span className="installed-badge">
      <Check size={14} /> Installée
    </span>
  );
}
