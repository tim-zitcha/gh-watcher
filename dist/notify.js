import notifier from "node-notifier";
export function sendNotifications(events) {
    for (const event of events) {
        notifier.notify({ title: event.title, message: event.message, sound: false, wait: false });
    }
}
