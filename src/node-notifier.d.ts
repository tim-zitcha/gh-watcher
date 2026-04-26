declare module "node-notifier" {
  interface NotifyOptions {
    title: string;
    message: string;
    sound?: boolean;
    wait?: boolean;
  }

  interface Notifier {
    notify(options: NotifyOptions, callback?: (error: Error | null) => void): void;
  }

  const notifier: Notifier;
  export default notifier;
}
