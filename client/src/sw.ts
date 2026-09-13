/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

import { db, recurrenceIntervalDays } from "./lib/db";
import type { Activity } from "./lib/types";
import { ALARM_CHANNEL_NAME, buildAlarmNotifications, computeAlarmTimes, jourJTag, veilleTag, type AlarmBroadcastMessage } from "./lib/alarms";

// ---------------------------------------------------------------------------
// Precaching & offline routing (this replaces what `generateSW` used to build
// automatically — see vite.config.ts, we're on `injectManifest` now so this
// custom worker can also own the notification/alarm logic below).
// ---------------------------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/offline\.html$/] }));

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "haricotmanager-images",
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "haricotmanager-api",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), rescheduleAllPendingAlarms()]));
});

// ---------------------------------------------------------------------------
// Background alarms
// ---------------------------------------------------------------------------
const hasTriggerSupport = () => "showTrigger" in Notification.prototype;

/** Re-reads every not-done activity and (re)schedules its two alarms. Runs whenever the
 *  Service Worker activates (new deploy, or the browser waking it up) and on the
 *  periodic/one-off sync events below — this is what fulfils "au démarrage du SW,
 *  relire toutes les activités et reprogrammer les alarmes". */
async function rescheduleAllPendingAlarms() {
  try {
    const [activities, parcels] = await Promise.all([db.activities.toArray(), db.parcels.toArray()]);
    const parcelById = new Map(parcels.map((parcel) => [parcel.id, parcel]));
    const now = Date.now();

    for (const activity of activities) {
      if (activity.done) continue;
      const { veille, jourJ } = computeAlarmTimes(activity);
      const { veille: veillePayload, jourJ: jourJPayload } = buildAlarmNotifications(activity, parcelById);

      // Clear any stale scheduled copies before re-adding, so edits/reschedules never double-fire.
      const existing = await self.registration.getNotifications({ includeTriggered: true } as GetNotificationOptions);
      existing.filter((n) => n.tag === veillePayload.tag || n.tag === jourJPayload.tag).forEach((n) => n.close());

      if (hasTriggerSupport()) {
        if (veille.getTime() > now) {
          await self.registration.showNotification(veillePayload.title, { ...veillePayload.options, showTrigger: new TimestampTrigger(veille.getTime()) });
        }
        if (jourJ.getTime() > now) {
          await self.registration.showNotification(jourJPayload.title, { ...jourJPayload.options, showTrigger: new TimestampTrigger(jourJ.getTime()) });
        }
      } else {
        // No Notification Triggers support on this browser (e.g. iOS Safari, or a fully
        // closed desktop browser): fall back to showing anything already due right now.
        // The rest of the coverage comes from useAlarmFallback() polling in the app
        // itself while it's open — there is no web-standard way to wake a fully closed,
        // non-installed browser at an arbitrary future time without a push server.
        if (veille.getTime() <= now && veille.getTime() > now - 60 * 60 * 1000) {
          await self.registration.showNotification(veillePayload.title, veillePayload.options);
        }
        if (jourJ.getTime() <= now && jourJ.getTime() > now - 60 * 60 * 1000) {
          await self.registration.showNotification(jourJPayload.title, jourJPayload.options);
        }
      }
    }
  } catch {
    // Best-effort — if IndexedDB isn't reachable yet this cycle, the next
    // activate/periodicsync/app-open check will catch up.
  }
}

self.addEventListener("periodicsync", (event: any) => {
  if (event.tag === "haricotmanager-recheck") event.waitUntil(rescheduleAllPendingAlarms());
});
self.addEventListener("sync", (event: any) => {
  if (event.tag === "haricotmanager-recheck-once") event.waitUntil(rescheduleAllPendingAlarms());
});

function broadcast(message: AlarmBroadcastMessage) {
  try {
    new BroadcastChannel(ALARM_CHANNEL_NAME).postMessage(message);
  } catch {
    // BroadcastChannel unsupported — the system notification already carried the alert.
  }
}

async function focusOrOpen(url: string) {
  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = clientsList.find((c) => "focus" in c);
  if (existing) {
    (existing as WindowClient).focus();
    existing.postMessage({ type: "navigate", url });
    return;
  }
  await self.clients.openWindow(url);
}

async function markActivityDone(activityId: string) {
  const activity = await db.activities.get(activityId);
  if (!activity) return;
  await db.activities.update(activityId, { doneAt: new Date().toISOString().slice(0, 10), done: true });
  const interval = recurrenceIntervalDays(activity);
  if (interval) await generateNextOccurrence(activity, interval);
}

/** Rolling recurrence: the next occurrence is only created once the current one is
 *  marked done, cloning its (possibly since-edited) fields — so an edit applied "to the
 *  whole series" naturally carries forward to occurrences generated after it. */
async function generateNextOccurrence(activity: Activity, intervalDays: number) {
  const next = new Date(`${activity.scheduledAt}T12:00:00`);
  next.setDate(next.getDate() + intervalDays);
  const nextActivity: Activity = {
    ...activity,
    id: crypto.randomUUID(),
    scheduledAt: next.toISOString().slice(0, 10),
    done: false,
    doneAt: undefined,
    notificationIds: [],
    seriesId: activity.seriesId ?? activity.id,
    createdAt: new Date().toISOString(),
  };
  await db.activities.add(nextActivity);
}

async function snoozeActivity(activityId: string) {
  const activity = await db.activities.get(activityId);
  if (!activity) return;
  const snoozed = new Date();
  snoozed.setHours(snoozed.getHours() + 1);
  const time = `${String(snoozed.getHours()).padStart(2, "0")}:${String(snoozed.getMinutes()).padStart(2, "0")}`;
  await db.activities.update(activityId, { time, scheduledAt: snoozed.toISOString().slice(0, 10) });
  if (hasTriggerSupport()) {
    const parcels = await db.parcels.toArray();
    const { jourJ: payload } = buildAlarmNotifications({ ...activity, time, scheduledAt: snoozed.toISOString().slice(0, 10) }, new Map(parcels.map((p) => [p.id, p])));
    await self.registration.showNotification(payload.title, { ...payload.options, showTrigger: new TimestampTrigger(snoozed.getTime()) });
  }
}

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  const data = (event.notification.data ?? {}) as { url?: string; activityId?: string; kind?: "veille" | "jourJ" };
  event.notification.close();

  if (data.kind === "jourJ") broadcast({ type: "jourJ", activityId: data.activityId ?? "" });

  if (event.action === "done" && data.activityId) {
    event.waitUntil(markActivityDone(data.activityId));
    return;
  }
  if (event.action === "snooze" && data.activityId) {
    event.waitUntil(snoozeActivity(data.activityId));
    return;
  }
  event.waitUntil(focusOrOpen(data.url ?? "/"));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "reschedule-alarms") event.waitUntil?.(rescheduleAllPendingAlarms());
});
