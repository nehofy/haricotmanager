import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Pont vers les notifications natives (Capacitor) quand l'app tourne en APK
 * Android. Contrairement à l'API Web Notification, LocalNotifications est
 * planifiée par le système d'exploitation lui-même : l'alarme se déclenche
 * même si l'app a été totalement fermée (swipe hors des apps récentes), ce
 * que la version PWA ne pouvait pas garantir (cf. README).
 *
 * Ce module ne fait rien en dehors d'un build natif : sur le web, les
 * fonctions exportées ici ne sont jamais appelées (voir hooks/useNotifications.ts,
 * qui garde intact le chemin Service Worker existant pour la PWA).
 */

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** Transforme un tag texte (ex: "haricotmanager-jourj-abc123") en entier 32 bits
 *  stable et positif — LocalNotifications exige un id numérique, alors que le
 *  reste de l'app raisonne avec des tags string (voir lib/alarms.ts). */
function idFromTag(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

export async function cancelNativeAlarms(tags: string[]): Promise<void> {
  if (!tags.length) return;
  try {
    await LocalNotifications.cancel({ notifications: tags.map((tag) => ({ id: idFromTag(tag) })) });
  } catch {
    // Rien à annuler / plugin pas encore prêt — sans conséquence, un nouvel
    // appel à schedule() ci-dessous écrase de toute façon le même id.
  }
}

export async function scheduleNativeAlarm(params: {
  tag: string;
  title: string;
  body: string;
  at: Date;
  activityId: string;
}): Promise<boolean> {
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: idFromTag(params.tag),
          title: params.title,
          body: params.body,
          schedule: { at: params.at, allowWhileIdle: true },
          // Nécessite alarm.mp3 copié dans android/app/src/main/res/raw/alarm.mp3
          // (sans extension dans le nom de ressource) — voir README section APK.
          sound: "alarm.mp3",
          smallIcon: "ic_stat_icon",
          extra: { activityId: params.activityId, tag: params.tag },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}
