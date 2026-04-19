export class PluginLogger {
  private readonly prefix = "[meridian-archiver]";

  constructor(private readonly debugMode: boolean) {}

  debug(...args: unknown[]): void {
    if (this.debugMode) {
      console.debug(this.prefix, ...args);
    }
  }

  error(...args: unknown[]): void {
    console.error(this.prefix, ...args);
  }
}
