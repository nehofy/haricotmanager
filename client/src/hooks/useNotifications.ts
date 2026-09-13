import { useCallback, useEffect, useState } from "react";
import type { Activity, Parcel } from "@/lib/types";
import { ALARM_CHANNEL_NAME, buildAlarmNotifications, computeAlarmTimes, jourJTag, veilleTag, type AlarmBroadcastMessage } from "@/lib/alarms";
import { db } from "@/lib/db";
import {
  cancelNativeAlarms,
  isNativePlatform,
  requestNativeNotificationPermission,
  scheduleNativeAlarm,
} from "@/lib/native-notifications";

export function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

/** Chrome (mainly on Android) can display a Service-Worker notification at a future
 *  timestamp even if the app/browser has been closed since. Not supported everywhere
 *  (notably not on iOS Safari) — always check this before relying on it, and fall back
 *  to the best-effort "check on open" behaviour otherwise. */
export function hasBackgroundTriggerSupport() {
  return isNotificationSupported() && typeof Notification !== "undefined" && "showTrigger" in Notification.prototype;
}

async function getRegistration() {
  if (!isNotificationSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Cancels any previously scheduled veille/jour J notifications for this activity. */
export async function cancelActivityAlarms(activityId: string) {
  const tags = [veilleTag(activityId), jourJTag(activityId)];

  // APK Android : l'alarme a été planifiée par l'OS via LocalNotifications, pas
  // par le Service Worker — c'est ce chemin qu'il faut annuler.
  if (isNativePlatform()) {
    await cancelNativeAlarms(tags);
    return;
  }

  const registration = await getRegistration();
  if (!registration) return;
  for (const tag of tags) {
    try {
      const existing = await registration.getNotifications({ tag, includeTriggered: true } as GetNotificationOptions);
      existing.forEach((notification) => notification.close());
    } catch {
      // Some browsers reject includeTriggered/tag combos silently — nothing to clean up then.
    }
  }
}

/** Schedules the veille (day before, 18h) and jour J alarms for one activity.
 *  Skips a slot if its time has already passed. Returns the notification tags that were
 *  actually (re)scheduled, to be stored on the activity for later cancellation. */
export async function scheduleActivityAlarms(activity: Activity, parcelById: Map<string, Parcel>): Promise<string[]> {
  if (activity.done) return [];

  const { veille, jourJ } = computeAlarmTimes(activity);
  const { veille: veillePayload, jourJ: jourJPayload } = buildAlarmNotifications(activity, parcelById);
  const now = Date.now();
  const scheduled: string[] = [];

  // APK Android : planification par l'OS (fiable même app totalement fermée),
  // au lieu de la trigger API web (peu/pas supportée, cf. hasBackgroundTriggerSupport).
  if (isNativePlatform()) {
    await cancelActivityAlarms(activity.id);
    for (const [when, payload] of [
      [veille, veillePayload],
      [jourJ, jourJPayload],
    ] as const) {
      if (when.getTime() <= now) continue;
      const ok = await scheduleNativeAlarm({
        tag: payload.tag,
        title: payload.title,
        body: payload.options.body ?? "",
        at: when,
        activityId: activity.id,
      });
      if (ok) scheduled.push(payload.tag);
    }
    return scheduled;
  }

  if (!isNotificationSupported() || Notification.permission !== "granted") return [];
  const registration = await getRegistration();
  if (!registration) return [];

  await cancelActivityAlarms(activity.id);
  const canTrigger = hasBackgroundTriggerSupport();

  for (const [when, payload] of [
    [veille, veillePayload],
    [jourJ, jourJPayload],
  ] as const) {
    if (when.getTime() <= now) continue; // slot already passed — nothing to schedule
    try {
      await registration.showNotification(payload.title, {
        ...payload.options,
        ...(canTrigger ? { showTrigger: new TimestampTrigger(when.getTime()) } : {}),
      });
      scheduled.push(payload.tag);
    } catch {
      // Browser refused this notification (permission race, unsupported option) — the
      // "check on open" fallback (see useAlarmFallback below) still covers this slot.
    }
  }
  return scheduled;
}

/** Re-schedules alarms for every not-yet-done activity — call this after bulk loads and
 *  whenever the underlying data could have drifted (app resumed from background, etc). */
export async function rescheduleAllAlarms(activities: Activity[], parcelById: Map<string, Parcel>) {
  if (!isNativePlatform() && (!isNotificationSupported() || Notification.permission !== "granted")) return;
  for (const activity of activities) {
    if (activity.done) continue;
    const notificationIds = await scheduleActivityAlarms(activity, parcelById);
    if (notificationIds.length) await db.activities.update(activity.id, { notificationIds });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isNativePlatform()) return requestNativeNotificationPermission();
  if (!isNotificationSupported()) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Best-effort fallback for when the browser can't schedule truly-in-background
 *  notifications (no Notification Triggers support — e.g. iOS Safari, or a desktop
 *  browser that's fully closed). Every time the app is open, visible, or the OS grants a
 *  periodic-sync tick, this compares "now" against each activity's veille/jour J time and
 *  shows anything due that the platform notification layer might have missed — plus plays
 *  alarm.mp3 for a jour J alarm while the app is in the foreground (the one moment a
 *  custom sound is actually possible on the web). */
export function useAlarmFallback(activities: Activity[], parcelById: Map<string, Parcel>, enabled: boolean) {
  const [shownTags, setShownTags] = useState<Set<string>>(new Set());

  const checkNow = useCallback(async () => {
    // Sur l'APK, LocalNotifications (OS) couvre déjà app fermée/arrière-plan —
    // ce filet de sécurité "vérifier à l'ouverture" est spécifique aux limites
    // du web et deviendrait redondant (voire en conflit) avec l'alarme native.
    if (isNativePlatform()) return;
    if (!enabled || !isNotificationSupported() || Notification.permission !== "granted") return;
    const registration = await getRegistration();
    if (!registration) return;
    const now = Date.now();

    for (const activity of activities) {
      if (activity.done) continue;
      const { veille, jourJ } = computeAlarmTimes(activity);
      const { veille: veillePayload, jourJ: jourJPayload } = buildAlarmNotifications(activity, parcelById);

      if (veille.getTime() <= now && !shownTags.has(veillePayload.tag)) {
        await registration.showNotification(veillePayload.title, veillePayload.options);
        setShownTags((current) => new Set(current).add(veillePayload.tag));
      }
      if (jourJ.getTime() <= now && !shownTags.has(jourJPayload.tag)) {
        await registration.showNotification(jourJPayload.title, jourJPayload.options);
        setShownTags((current) => new Set(current).add(jourJPayload.tag));
        try {
          void new Audio("/alarm.mp3").play();
        } catch {
          // Autoplay can be blocked without a prior user gesture — the system
          // notification (with vibration) still went through above regardless.
        }
      }
    }
  }, [activities, parcelById, enabled, shownTags]);

  useEffect(() => {
    void checkNow();
    const interval = window.setInterval(() => void checkNow(), 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") void checkNow(); };
    document.addEventListener("visibilitychange", onVisible);

    let channel: BroadcastChannel | undefined;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(ALARM_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<AlarmBroadcastMessage>) => {
        if (event.data?.type === "jourJ") {
          try {
            void new Audio("/alarm.mp3").play();
          } catch {
            // Ignore — the notification itself already fired from the Service Worker.
          }
        }
      };
    }

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, [checkNow]);
}
