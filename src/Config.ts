import { GpioPins, TriggerNames, FrontPanelGpioPins } from "./types";
import { logger } from "./utils/logger";

export class Config {
  public startupTimestamp: number;
  public readonly serialPort: string;
  public readonly serialBaudrate: number;
  public readonly gpioPins: GpioPins;
  public readonly frontPanelGpioPins: FrontPanelGpioPins;
  public readonly triggerNames: TriggerNames;
  public readonly phoneNumbers: string[];
  public readonly atCommandTimeout: number;
  public readonly atCommandRetry: number;
  public readonly disableWelcomeSMS: boolean;
  public readonly disableAlertSMS: boolean;
  public readonly disableLED: boolean;
  public readonly disableSound: boolean;
  public readonly smsCooldownPeriod: number;
  public readonly gpioLegacyOffset: number;

  constructor() {
    this.startupTimestamp = Date.now();
    this.serialPort = process.env.SERIAL_PORT || "/dev/ttyUSB0";
    this.serialBaudrate = parseInt(process.env.SERIAL_BAUDRATE || "9600", 10);

    this.gpioPins = {
      trigger1: parseInt(process.env.GPIO_TRIGGER_1 || "17", 10),
      trigger2: parseInt(process.env.GPIO_TRIGGER_2 || "27", 10),
      trigger3: parseInt(process.env.GPIO_TRIGGER_3 || "22", 10),
    };

    this.frontPanelGpioPins = {
      led: parseInt(process.env.GPIO_LED || "8", 10),
      speaker: parseInt(process.env.GPIO_SPK || "7", 10),
      switch1: parseInt(process.env.GPIO_SW1 || "19", 10),
      switch2: parseInt(process.env.GPIO_SW2 || "26", 10),
    };

    this.triggerNames = {
      trigger1: process.env.TRIGGER_1_NAME || "Trigger 1",
      trigger2: process.env.TRIGGER_2_NAME || "Trigger 2",
      trigger3: process.env.TRIGGER_3_NAME || "Trigger 3",
    };

    this.phoneNumbers = this.parsePhoneNumbers(process.env.PHONE_NUMBERS);

    this.atCommandTimeout = parseInt(
      process.env.AT_COMMAND_TIMEOUT || "5000",
      10
    );
    this.atCommandRetry = parseInt(process.env.AT_COMMAND_RETRY || "3", 10);

    this.disableWelcomeSMS = process.env.DISABLE_WELCOME_SMS === "1";
    this.disableAlertSMS = process.env.DISABLE_ALERT_SMS === "1";
    this.disableLED = process.env.DISABLE_LED === "1";
    this.disableSound = process.env.DISABLE_SOUND === "1";

    this.smsCooldownPeriod = parseInt(
      process.env.SMS_COOLDOWN_PERIOD || "300000",
      10
    );

    this.gpioLegacyOffset = parseInt(
      process.env.GPIO_LEGACY_OFFSET || "512",
      10
    );

    this.validate();
  }

  private parsePhoneNumbers(numbersString?: string): string[] {
    if (!numbersString) {
      return [];
    }
    return numbersString
      .split(",")
      .map((num) => num.trim())
      .filter((num) => num.length > 0);
  }

  private validate(): void {
    if (!this.serialPort) {
      throw new Error("SERIAL_PORT is required in configuration");
    }

    if (this.phoneNumbers.length === 0) {
      logger.warn(
        "WARNING: No phone numbers configured. SMS alerts will not be sent."
      );
    }

    if (isNaN(this.serialBaudrate) || this.serialBaudrate <= 0) {
      throw new Error("Invalid SERIAL_BAUDRATE configuration");
    }

    Object.entries(this.gpioPins).forEach(([key, pin]) => {
      if (isNaN(pin) || pin < 0) {
        throw new Error(`Invalid GPIO pin configuration for ${key}: ${pin}`);
      }
    });
  }

  public getUptimeValue(): { days: number; hours: number } {
    const uptime = Date.now() - this.startupTimestamp;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    return { days, hours };
  }

  public adjustStartupTimestamp(timeDifference: number): void {
    this.startupTimestamp += timeDifference;
  }

  public display(): void {
    logger.info(
      `\n=== PiGuard Configuration ===\n` +
        `Serial Port: ${this.serialPort}\n` +
        `Baud Rate: ${this.serialBaudrate}\n` +
        `\nGPIO Pins:\n` +
        `  Trigger 1 (${this.triggerNames.trigger1}): GPIO ${this.gpioPins.trigger1}\n` +
        `  Trigger 2 (${this.triggerNames.trigger2}): GPIO ${this.gpioPins.trigger2}\n` +
        `  Trigger 3 (${this.triggerNames.trigger3}): GPIO ${this.gpioPins.trigger3}\n` +
        `\nFront Panel GPIO:\n` +
        `  LED: GPIO ${this.frontPanelGpioPins.led}\n` +
        `  Speaker: GPIO ${this.frontPanelGpioPins.speaker}\n` +
        `  Switch 1: GPIO ${this.frontPanelGpioPins.switch1}\n` +
        `  Switch 2: GPIO ${this.frontPanelGpioPins.switch2}\n` +
        `\nPhone Numbers: ${this.phoneNumbers.join(", ")}\n` +
        `AT Command Timeout: ${this.atCommandTimeout}ms\n` +
        `AT Command Retry: ${this.atCommandRetry}\n` +
        `Welcome SMS: ${this.disableWelcomeSMS ? "DISABLED" : "ENABLED"}\n` +
        `Alert SMS: ${this.disableAlertSMS ? "DISABLED" : "ENABLED"}\n` +
        `LED: ${this.disableLED ? "DISABLED" : "ENABLED"}\n` +
        `Sound: ${this.disableSound ? "DISABLED" : "ENABLED"}\n` +
        `SMS Cooldown Period: ${this.smsCooldownPeriod}ms (${
          this.smsCooldownPeriod / 60000
        } minutes)\n` +
        `=============================\n`
    );
  }
}
