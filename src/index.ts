import * as dotenv from "dotenv";
import { Chip, Line } from "node-libgpiod";
import { Config } from "./Config";
import { GSMModule } from "./GSMModule";
import { TriggerInfo, SystemStatus, SMSResult, GpioPins } from "./types";

dotenv.config();

class PiGuard {
  private config: Config;
  private gsm: GSMModule;
  private triggers: Record<string, TriggerInfo> = {};
  private isRunning: boolean = false;
  private lastAlertTime: number = 0;
  private cooldownPeriod: number = 5 * 60 * 1000;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 10;
  private gpioChip: Chip | null = null;

  constructor() {
    this.config = new Config();
    this.gsm = new GSMModule(this.config);
  }

  public async initialize(): Promise<void> {
    console.log("=================================");
    console.log("     PiGuard Starting Up");
    console.log("=================================");

    this.config.display();

    try {
      await this.gsm.initialize();
      await this.setupTriggers();

      this.isRunning = true;
      console.log("[PiGuard] System ready and monitoring...\n");

      await this.sendStartupNotification();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[PiGuard] Initialization failed:", errorMessage);
      throw error;
    }
  }

  private async setupTriggers(): Promise<void> {
    console.log("[PiGuard] Setting up GPIO triggers...");

    if (process.platform !== "linux") {
      console.warn(
        `[PiGuard] GPIO is only supported on Linux (Raspberry Pi). Current platform: ${process.platform}`
      );
      console.warn("[PiGuard] GPIO triggers will not be available.");
      return;
    }

    const gpioConfig = this.config.getGPIOConfig();

    try {
      this.gpioChip = new Chip(0);

      let successCount = 0;

      for (const [key, pin] of Object.entries(gpioConfig)) {
        const triggerName = this.config.getTriggerName(key as keyof GpioPins);
        let line: Line | null = null;

        try {
          line = new Line(this.gpioChip, pin);
          line.requestInputMode();

          const initialValue = line.getValue();
          console.log(
            `[PiGuard] ✓ ${triggerName} monitoring on GPIO ${pin} (initial state: ${initialValue})`
          );

          this.triggers[key] = {
            gpio: line,
            pin,
            name: triggerName,
            lastValue: initialValue,
          };

          successCount++;
        } catch (error) {
          console.error(
            `[PiGuard] Failed to setup trigger ${key} (${triggerName}) on GPIO ${pin}:`,
            error
          );

          if (line) {
            try {
              line.release();
            } catch (e) {}
          }
        }
      }

      if (successCount > 0) {
        console.log(
          `[PiGuard] ${successCount} trigger(s) configured successfully\n`
        );
        this.startPolling();
      } else {
        console.warn("[PiGuard] No GPIO triggers configured\n");
        this.gpioChip = null;
      }
    } catch (error) {
      console.error(`[PiGuard] Failed to load GPIO module:`, error);
    }
  }

  private startPolling(): void {
    if (this.pollInterval) {
      return;
    }

    this.pollInterval = setInterval(() => {
      if (!this.isRunning) {
        return;
      }

      Object.entries(this.triggers).forEach(([key, trigger]) => {
        try {
          const currentValue = trigger.gpio.getValue();

          if (trigger.lastValue === 0 && currentValue === 1) {
            this.handleTrigger(key, trigger.name);
          }

          trigger.lastValue = currentValue;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[PiGuard] Error polling ${trigger.name} (GPIO ${trigger.pin}):`,
            errorMessage
          );
        }
      });
    }, this.POLL_INTERVAL_MS);
  }

  private async handleTrigger(
    _triggerKey: string,
    triggerName: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n[ALERT] ${timestamp} - ${triggerName} TRIGGERED!`);

    if (this.isInCooldown()) {
      console.log(`[PiGuard] System is in cooldown period, skipping alert`);
      return;
    }

    this.lastAlertTime = Date.now();

    try {
      const results: SMSResult[] = await this.gsm.sendAlert(triggerName);

      results.forEach((result) => {
        if (!result.success) {
          console.error(
            `[PiGuard] Failed to send alert to ${result.phoneNumber}: ${result.error}`
          );
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[PiGuard] Error sending alert for ${triggerName}:`,
        errorMessage
      );
    }

    console.log("");
  }

  private isInCooldown(): boolean {
    if (this.lastAlertTime === 0) return false;

    const elapsed = Date.now() - this.lastAlertTime;
    return elapsed < this.cooldownPeriod;
  }

  private async sendStartupNotification(): Promise<void> {
    try {
      const phoneNumbers = this.config.getPhoneNumbers();
      if (phoneNumbers.length === 0) return;

      const message = `PiGuard surveillance system is now active at ${new Date().toLocaleString()}`;

      for (const phoneNumber of phoneNumbers) {
        try {
          await this.gsm.sendSMS(phoneNumber, message);
          console.log(`[PiGuard] Startup notification sent to ${phoneNumber}`);
        } catch (error) {
          console.error(
            `[PiGuard] Failed to send startup notification to ${phoneNumber}`
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[PiGuard] Error sending startup notification:",
        errorMessage
      );
    }
  }

  public async shutdown(): Promise<void> {
    console.log("\n[PiGuard] Shutting down...");

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    Object.entries(this.triggers).forEach(([_key, trigger]) => {
      try {
        trigger.gpio.release();
        console.log(`[PiGuard] Released GPIO ${trigger.pin}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[PiGuard] Error releasing GPIO ${trigger.pin}:`,
          errorMessage
        );
      }
    });

    this.gpioChip = null;

    await this.gsm.close();

    console.log("[PiGuard] Shutdown complete");
    process.exit(0);
  }

  public getStatus(): SystemStatus {
    const inCooldown = this.isInCooldown();
    return {
      running: this.isRunning,
      triggers: Object.entries(this.triggers).map(([key, trigger]) => ({
        key,
        name: trigger.name,
        pin: trigger.pin,
        cooldown: inCooldown,
      })),
      gsm: this.gsm.getStatus(),
    };
  }
}

const piGuard = new PiGuard();

process.on("SIGINT", async () => {
  console.log("\n[PiGuard] Received SIGINT signal");
  await piGuard.shutdown();
});

process.on("SIGTERM", async () => {
  console.log("\n[PiGuard] Received SIGTERM signal");
  await piGuard.shutdown();
});

process.on("uncaughtException", (error: Error) => {
  console.error("[PiGuard] Uncaught exception:", error);
  piGuard.shutdown();
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    console.error(
      "[PiGuard] Unhandled rejection at:",
      promise,
      "reason:",
      reason
    );
  }
);

piGuard.initialize().catch((error: Error) => {
  console.error("[PiGuard] Failed to start:", error.message);
  process.exit(1);
});
