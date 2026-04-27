import notifier from "node-notifier";

import type { NotificationEvent } from "./types.js";


export function sendNotifications(events: NotificationEvent[]): void {
  for (const event of events) {
    notifier.notify({ title: event.title, message: event.message, sound: false, wait: false });
  }
}
