import type { Activity, Parcel } from "./types";

const NOTIFIED_IDS_KEY = "haricotmanager:notified-activity-ids";
const MAX_TRACKED_IDS = 500; // keeps localStorage from growing forever

function readNotifiedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeNotifiedIds(ids: Set<string>) {
  const trimmed = Array.from(ids).slice(-MAX_TRACKED_IDS);
  localStorage.setItem(NOTIFIED_IDS_KEY, JSON.stringify(trimmed));
}

export function isNotificationSupported() {
  return "Notification" in window && "serviceWorker" in navigator;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * IMPORTANT — this is an on-device reminder, not a server push notification.
 * With no backend, there is nothing to send a notification while the app is
 * fully closed and the OS has evicted its process. What this *does* reliably
 * cover: the moment the app is opened or brought to the foreground (including
 * from the home-screen icon), any task due today or overdue immediately
 * surfaces as a real system notification via the Service Worker — plus an
 * app-icon badge count that's visible without opening the app at all.
 */
export async function notifyDueActivities(
  activities: Activity[],
  parcelById: Map<string, Parcel>,
): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;

  const today = new Date().toISOString().slice(0, 10);
  const due = activities.filter((activity) => !activity.done && activity.scheduledAt <= today);
  if (!due.length) return;

  const notified = readNotifiedIds();
  const toNotify = due.filter((activity) => !notified.has(activity.id));
  if (!toNotify.length) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    for (const activity of toNotify.slice(0, 5)) {
      const parcelName = parcelById.get(activity.parcelId)?.name ?? "Parcelle";
      const overdue = activity.scheduledAt < today;
      await registration.showNotification("HaricotManager", {
        body: `${activity.name} — ${parcelName}${overdue ? " (en retard)" : ""}`,
        tag: `activity-${activity.id}`, // replaces rather than stacks if shown again
        icon: "/icons/pwa-192x192.png",
        badge: "/icons/pwa-192x192.png",
      });
      notified.add(activity.id);
    }
    writeNotifiedIds(notified);
  } catch {
    // Service worker not ready / notifications blocked mid-session — safe to ignore,
    // the in-app task list still shows everything regardless.
  }
}

/** Clears the tracking so already-seen tasks can notify again (e.g. after editing a due date back). */
export function forgetNotified(activityId: string) {
  const notified = readNotifiedIds();
  notified.delete(activityId);
  writeNotifiedIds(notified);
}

export function isBadgingSupported() {
  return "setAppBadge" in navigator;
}

/** Updates the small count badge on the installed app's home-screen icon (Android/desktop Chrome). */
export async function updateAppBadge(count: number) {
  if (!isBadgingSupported()) return;
  try {
    if (count > 0) await (navigator as unknown as { setAppBadge: (n: number) => Promise<void> }).setAppBadge(count);
    else await (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
  } catch {
    // Badging API can throw on unsupported platforms despite the feature check passing.
  }
}
