import * as dotenv from "dotenv";
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

    const gpioConfig = this.config.getGPIOConfig();

    try {
      const { Gpio } = await import("onoff");

      Object.entries(gpioConfig).forEach(([key, pin]) => {
        try {
          const gpio = new Gpio(pin, "in", "rising", { debounceTimeout: 100 });
          const triggerName = this.config.getTriggerName(key as keyof GpioPins);

          gpio.watch((err, value) => {
            if (err) {
              console.error(
                `[PiGuard] Error on ${triggerName} (GPIO ${pin}):`,
                err
              );
              return;
            }

            if (value === 1) {
              this.handleTrigger(key, triggerName);
            }
          });

          this.triggers[key] = {
            gpio,
            pin,
            name: triggerName,
          };

          console.log(`[PiGuard] ✓ ${triggerName} monitoring on GPIO ${pin}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[PiGuard] Failed to setup trigger ${key} on GPIO ${pin}:`,
            errorMessage
          );
          console.error(
            `[PiGuard] Make sure you're running on a Raspberry Pi with proper permissions`
          );
        }
      });

      console.log("[PiGuard] All triggers configured\n");
    } catch (error) {
      console.error(
        "[PiGuard] onoff module not available. GPIO features disabled."
      );
    }
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
        if (result.success) {
          console.log(`[PiGuard] ✓ Alert sent to ${result.phoneNumber}`);
        } else {
          console.error(
            `[PiGuard] ✗ Failed to send alert to ${result.phoneNumber}: ${result.error}`
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

    Object.entries(this.triggers).forEach(([_key, trigger]) => {
      try {
        trigger.gpio.unexport();
        console.log(`[PiGuard] Unexported GPIO ${trigger.pin}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[PiGuard] Error unexporting GPIO ${trigger.pin}:`,
          errorMessage
        );
      }
    });

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

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error(
    "[PiGuard] Unhandled rejection at:",
    promise,
    "reason:",
    reason
  );
});

piGuard.initialize().catch((error: Error) => {
  console.error("[PiGuard] Failed to start:", error.message);
  process.exit(1);
});
