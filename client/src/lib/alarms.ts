import type { Activity, Parcel } from "./types";

/** Every notification this app schedules is tagged so it can be found/cancelled later. */
export const veilleTag = (activityId: string) => `haricotmanager-veille-${activityId}`;
export const jourJTag = (activityId: string) => `haricotmanager-jourj-${activityId}`;

export const ALARM_CHANNEL_NAME = "haricotmanager-alarms";

/** Broadcast payload the Service Worker sends to open tabs so the foreground app can
 *  play the custom alarm sound and refresh its UI. Background/closed-app notifications
 *  can't carry a custom sound (the Web platform has no such API) — they rely on the
 *  device's default notification sound + vibration instead. */
export type AlarmBroadcastMessage = { type: "jourJ" | "veille"; activityId: string };

/** Combines an activity's date + time-of-day fields into a concrete local Date. */
export function activityDateTime(activity: Pick<Activity, "scheduledAt" | "time">): Date {
  const time = activity.time || "08:00";
  return new Date(`${activity.scheduledAt}T${time}:00`);
}

/** Returns the two alarm timestamps for an activity: the 18:00 reminder the day before,
 *  and the alarm at the activity's own scheduled time on the day itself. */
export function computeAlarmTimes(activity: Pick<Activity, "scheduledAt" | "time">) {
  const jourJ = activityDateTime(activity);
  const veille = new Date(jourJ);
  veille.setDate(veille.getDate() - 1);
  veille.setHours(18, 0, 0, 0);
  return { veille, jourJ };
}

function parcelLabel(parcelId: string, parcelById: Map<string, Parcel>) {
  return parcelById.get(parcelId)?.name ?? "Parcelle";
}

/** Builds the two `showNotification` payloads (veille + jour J) for an activity. */
export function buildAlarmNotifications(activity: Activity, parcelById: Map<string, Parcel>) {
  const parcel = parcelLabel(activity.parcelId, parcelById);
  const url = `/?activity=${activity.id}`;

  const veille: { tag: string; title: string; options: NotificationOptions } = {
    tag: veilleTag(activity.id),
    title: `Rappel : ${activity.name} demain`,
    options: {
      body: `${parcel} - Type : ${activity.type}.${activity.notes ? ` Notes : ${activity.notes}` : ""}`,
      icon: "/icons/pwa-192x192.png",
      badge: "/icons/pwa-192x192.png",
      tag: veilleTag(activity.id),
      data: { url, activityId: activity.id, kind: "veille" },
    },
  };

  const jourJ: { tag: string; title: string; options: NotificationOptions } = {
    tag: jourJTag(activity.id),
    title: `À FAIRE AUJOURD'HUI : ${activity.name}`,
    options: {
      body: `${parcel}${activity.notes ? ` - ${activity.notes}` : ""}`,
      icon: "/icons/pwa-192x192.png",
      badge: "/icons/pwa-192x192.png",
      tag: jourJTag(activity.id),
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
      data: { url, activityId: activity.id, kind: "jourJ" },
      actions: [
        { action: "done", title: "Fait" },
        { action: "snooze", title: "Reporter 1h" },
      ],
    } as NotificationOptions,
  };

  return { veille, jourJ };
}
