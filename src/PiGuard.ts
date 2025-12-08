import { Config } from "./Config";
import { FrontPanel, LedState } from "./FrontPanel";
import { GSMModule } from "./GSMModule";
import { TriggerInfo, SystemStatus, SMSResult, GpioPins } from "./types";
import { shutdownRaspberryPi } from "./utils/shutdownUtils";
import { logger, errorLogger } from "./utils/logger";

export class PiGuard {
  private config: Config;
  private gsm: GSMModule;
  private frontPanel: FrontPanel;
  private triggers: Record<string, TriggerInfo> = {};
  private activeTriggers: Set<string> = new Set();
  private isRunning: boolean = false;
  private lastAlertTime: number = 0;
  private alertsDisabled: boolean = false;

  constructor() {
    this.config = new Config();
    this.gsm = new GSMModule(this.config);
    this.frontPanel = new FrontPanel(this.config);
  }

  public async initialize(): Promise<void> {
    logger.info(
      "\n=================================\n     PiGuard Starting Up\n================================="
    );

    this.config.display();

    try {
      await this.gsm.initialize();
      await this.frontPanel.initialize();

      if (this.frontPanel.isSwitch1Pressed()) {
        logger.info(
          "[PiGuard] Switch 1 is pressed on startup - disabling SMS alerts"
        );
        this.alertsDisabled = true;
        this.frontPanel.setLedState(LedState.SolidOn);
      }

      this.lastAlertTime = Date.now(); // Prevent immediate alert SMS
      await this.setupTriggers();
      this.setupFrontPanelHandlers();

      this.isRunning = true;

      this.frontPanel.playLongBeep();
      this.updateLedState();
      logger.info("[PiGuard] System ready and monitoring...\n");
      await this.sendStartupNotification();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error("[PiGuard] Initialization failed:", errorMessage);
      throw error;
    }
  }

  private async setupTriggers(): Promise<void> {
    logger.info("[PiGuard] Setting up GPIO triggers...");

    if (process.platform !== "linux") {
      logger.warn(
        `[PiGuard] GPIO is only supported on Linux (Raspberry Pi). Current platform: ${process.platform}\n[PiGuard] GPIO triggers will not be available.`
      );
      return;
    }

    try {
      const { Gpio } = await import("onoff");

      let successCount = 0;

      for (const [key, pin] of Object.entries(this.config.gpioPins)) {
        const triggerName =
          this.config.triggerNames[key as keyof GpioPins] || "Unknown Trigger";
        let gpio: any = null;

        try {
          try {
            const existingGpio = new Gpio(
              pin + this.config.gpioLegacyOffset,
              "in",
              "none"
            );
            existingGpio.unexport();
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (e) {}

          gpio = new Gpio(pin + this.config.gpioLegacyOffset, "in", "both", {
            debounceTimeout: 1000,
            reconfigureDirection: true,
          });

          gpio.watch((err: Error | null | undefined, value: number) => {
            if (err) {
              errorLogger.error(
                `[PiGuard] Error watching ${triggerName} (GPIO ${pin}):`,
                err
              );
              return;
            }

            if (value === 1) {
              // Only trigger alarm if the trigger wasn't already active (state change)
              const wasAlreadyActive = this.activeTriggers.has(key);
              if (!wasAlreadyActive) {
                this.activeTriggers.add(key);
                this.handleTrigger(triggerName);
              }
            } else if (value === 0) {
              this.activeTriggers.delete(key);
            }
            this.updateLedState();
          });

          const initialValue = gpio.readSync();
          logger.info(
            `[PiGuard] ✓ ${triggerName} monitoring on GPIO ${pin} (initial state: ${initialValue})`
          );

          if (initialValue === 1) {
            this.activeTriggers.add(key);
          }

          this.triggers[key] = {
            gpio,
            pin,
            name: triggerName,
          };

          successCount++;
        } catch (error) {
          errorLogger.error(
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
        logger.info(
          `[PiGuard] ${successCount} trigger(s) configured successfully`
        );
      } else {
        logger.warn("[PiGuard] No GPIO triggers configured");
      }
    } catch (error) {
      errorLogger.error(`[PiGuard] Failed to load GPIO module:`, error);
    }
  }

  private async handleTrigger(triggerName: string): Promise<void> {
    const uptime = this.config.getUptimeValue();
    const message = `ALERT: ${triggerName} triggered! Uptime: ${uptime.days}d ${uptime.hours}h`;
    logger.warn(`${message}`);

    if (this.isInCooldown()) {
      logger.info(`[PiGuard] System is in cooldown period, skipping alert`);
      return;
    }

    this.frontPanel.playMelodyUp();
    this.lastAlertTime = Date.now();

    if (this.config.disableAlertSMS) {
      logger.info(`[PiGuard] Alert SMS is disabled, skipping SMS sending\n`);
      return;
    }

    try {
      const results: SMSResult[] = await this.gsm.sendToAll(message);

      results.forEach((result) => {
        if (!result.success) {
          errorLogger.error(
            `[PiGuard] Failed to send alert to ${result.phoneNumber}: ${result.error}`
          );
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error(
        `[PiGuard] Error sending alert for ${triggerName}:`,
        errorMessage
      );
    }
  }

  private isInCooldown(): boolean {
    if (this.alertsDisabled) return true;
    if (this.lastAlertTime === 0) return false;

    const elapsed = Date.now() - this.lastAlertTime;
    return elapsed < this.config.smsCooldownPeriod;
  }

  private setupFrontPanelHandlers(): void {
    this.frontPanel.onSwitch1Pressed(() => {
      this.alertsDisabled = true;
      this.frontPanel.playSingleBeep();
      this.frontPanel.setLedState(LedState.SolidOn);
    });
    this.frontPanel.onSwitch1Released(() => {
      this.alertsDisabled = false;
      this.lastAlertTime = Date.now(); // Prevent immediate alert SMS
      this.frontPanel.playSingleBeep();
      this.updateLedState();
    });
    this.frontPanel.onSwitch2ShortPress(async () => {
      this.frontPanel.playSingleBeep();
      try {
        await this.sendDiagnosticSMS();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errorLogger.error(
          "[PiGuard] Error in switch2ShortPress handler:",
          errorMessage
        );
      }
    });
    this.frontPanel.onSwitch2LongPress(async () => {
      await this.frontPanel.playMelodyDown();
      await this.cleanup();
      shutdownRaspberryPi();
    });
  }

  private updateLedState(): void {
    if (this.alertsDisabled) {
      return; // Alredy in SolidOn state
    }
    if (this.activeTriggers.size > 0) {
      this.frontPanel.setLedState(LedState.FastBlink);
    } else {
      this.frontPanel.setLedState(LedState.SlowFlash);
    }
  }

  private async sendStartupNotification(): Promise<void> {
    if (this.config.disableWelcomeSMS) {
      logger.info(
        `[PiGuard] Welcome SMS is disabled, skipping startup notification`
      );
      return;
    }

    try {
      await this.gsm.sendToAll(
        this.gsm.getCompactStatusReport(this.activeTriggers)
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error(
        "[PiGuard] Error sending startup notification:",
        errorMessage
      );
    }
  }

  private async cleanup(): Promise<void> {
    logger.warn("[PiGuard] Cleaning up resources...");

    this.isRunning = false;

    Object.entries(this.triggers).forEach(([_key, trigger]) => {
      try {
        trigger.gpio.unexport();
        logger.info(`[PiGuard] Unexported GPIO ${trigger.pin}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errorLogger.error(
          `[PiGuard] Error unexporting GPIO ${trigger.pin}:`,
          errorMessage
        );
      }
    });

    await this.gsm.close();
    await this.frontPanel.cleanup();

    logger.info("[PiGuard] Cleanup complete");
  }

  public async shutdown(): Promise<void> {
    await this.cleanup();
    process.exit(0);
  }

  public getStatus(): SystemStatus {
    const inCooldown = this.isInCooldown();
    return {
      running: this.isRunning,
      inCooldown: inCooldown,
      triggers: Object.entries(this.triggers).map(([key, trigger]) => ({
        key,
        name: trigger.name,
        pin: trigger.pin,
      })),
      gsm: this.gsm.getStatus(),
    };
  }

  public getConfig(): Config {
    return this.config;
  }

  public getGSM(): GSMModule {
    return this.gsm;
  }

  public getFrontPanel(): FrontPanel {
    return this.frontPanel;
  }

  public async sendDiagnosticSMS(): Promise<SMSResult[]> {
    try {
      await this.gsm.performConnectionTest();
      const statusReport = this.gsm.getCompactStatusReport(this.activeTriggers);
      return await this.gsm.sendToAll(statusReport);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error(
        "[PiGuard] Failed to send diagnostic SMS:",
        errorMessage
      );
      return [];
    }
  }

  public getInputStates(): Array<{
    number: number;
    name: string;
    state: boolean;
  }> {
    const inputs: Array<{
      number: number;
      name: string;
      state: boolean;
    }> = [];

    const triggerKeys = ["trigger1", "trigger2", "trigger3"] as const;

    triggerKeys.forEach((key, index) => {
      const triggerName =
        this.config.triggerNames[key] || `Trigger ${index + 1}`;
      let state: boolean = false;

      if (this.activeTriggers.has(key)) {
        state = true;
      } else {
        const trigger = this.triggers[key];
        if (trigger && trigger.gpio) {
          try {
            const value = trigger.gpio.readSync();
            state = value === 1;
          } catch (error) {
            state = false;
          }
        }
      }

      inputs.push({
        number: index + 1,
        name: triggerName,
        state: state,
      });
    });

    return inputs;
  }
}
