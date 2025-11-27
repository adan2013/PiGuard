import { Config } from "./Config";
import { FrontPanel, LedState } from "./FrontPanel";
import { GSMModule } from "./GSMModule";
import { TriggerInfo, SystemStatus, SMSResult, GpioPins } from "./types";

export class PiGuard {
  private config: Config;
  private gsm: GSMModule;
  private frontPanel: FrontPanel;
  private triggers: Record<string, TriggerInfo> = {};
  private isRunning: boolean = false;
  private lastAlertTime: number = 0;
  private cooldownPeriod: number = 5 * 60 * 1000;

  constructor() {
    this.config = new Config();
    this.gsm = new GSMModule(this.config);
    this.frontPanel = new FrontPanel(this.config);
  }

  public async initialize(): Promise<void> {
    console.log("=================================");
    console.log("     PiGuard Starting Up");
    console.log("=================================");

    this.config.display();

    try {
      await this.gsm.initialize();
      await this.frontPanel.initialize();
      await this.setupTriggers();

      this.isRunning = true;
      this.frontPanel.setLedState(LedState.SlowFlash);
      this.frontPanel.playSingleBeep();
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
      const { Gpio } = await import("onoff");

      let successCount = 0;

      for (const [key, pin] of Object.entries(gpioConfig)) {
        const triggerName = this.config.getTriggerName(key as keyof GpioPins);
        let gpio: any = null;

        try {
          try {
            const existingGpio = new Gpio(
              pin + this.config.getGpioLegacyOffset(),
              "in",
              "none"
            );
            existingGpio.unexport();
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (e) {}

          gpio = new Gpio(
            pin + this.config.getGpioLegacyOffset(),
            "in",
            "rising",
            {
              debounceTimeout: 1000,
              reconfigureDirection: true,
            }
          );

          gpio.watch((err: Error | null | undefined, value: number) => {
            if (err) {
              console.error(
                `[PiGuard] Error watching ${triggerName} (GPIO ${pin}):`,
                err
              );
              return;
            }

            if (value === 1) {
              this.handleTrigger(key, triggerName);
            }
          });

          const initialValue = gpio.readSync();
          console.log(
            `[PiGuard] ✓ ${triggerName} monitoring on GPIO ${pin} (initial state: ${initialValue})`
          );

          this.triggers[key] = {
            gpio,
            pin,
            name: triggerName,
          };

          successCount++;
        } catch (error) {
          console.error(
            `[PiGuard] Failed to setup trigger ${key} (${triggerName}) on GPIO ${pin}:`,
            error
          );

          if (gpio) {
            try {
              gpio.unexport();
            } catch (e) {}
          }
        }
      }

      if (successCount > 0) {
        console.log(
          `[PiGuard] ${successCount} trigger(s) configured successfully\n`
        );
      } else {
        console.warn("[PiGuard] No GPIO triggers configured\n");
      }
    } catch (error) {
      console.error(`[PiGuard] Failed to load GPIO module:`, error);
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

    if (this.config.isAlertSMSDisabled()) {
      console.log(`[PiGuard] Alert SMS is disabled, skipping SMS sending`);
      console.log("");
      return;
    }

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
    if (this.config.isWelcomeSMSDisabled()) {
      console.log(
        `[PiGuard] Welcome SMS is disabled, skipping startup notification`
      );
      return;
    }

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
    await this.frontPanel.cleanup();

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
