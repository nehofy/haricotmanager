// The Notification Triggers API (showTrigger / TimestampTrigger) lets a Service Worker
// display a notification at a future timestamp without the page being open — the
// mechanism this app uses for true background alarms. It shipped behind a flag /
// origin trial in Chromium and is still not part of the standard TS "dom" lib, and
// is NOT supported by every browser (notably not by Safari/iOS as of writing) — always
// feature-detect with `"showTrigger" in Notification.prototype` before relying on it.
// See: https://developer.chrome.com/docs/web-platform/notification-triggers

interface TimestampTrigger {
  readonly timestamp: number;
}

declare var TimestampTrigger: {
  prototype: TimestampTrigger;
  new (timestamp: number): TimestampTrigger;
};

interface NotificationOptions {
  showTrigger?: TimestampTrigger;
}

interface GetNotificationOptions {
  tag?: string;
  includeTriggered?: boolean;
}
