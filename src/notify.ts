import notifier from "node-notifier";

import type { NotificationEvent } from "./types.js";

export async function sendNotifications(events: NotificationEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  await Promise.all(
    events.map(
      (event) =>
        new Promise<void>((resolve, reject) => {
          notifier.notify(
            {
              title: event.title,
              message: event.message,
              sound: false,
              wait: false
            },
            (error) => (error ? reject(error) : resolve())
          );
        }).catch(() => {})
    )
  );
}
