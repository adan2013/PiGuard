import { Gpio } from "onoff";
import { spawn } from "child_process";
import { join } from "path";
import { Config } from "./Config";
import { logger, errorLogger } from "./utils/logger";

export enum LedState {
  Off = "Off",
  SlowFlash = "SlowFlash",
  SlowBlink = "SlowBlink",
  FastBlink = "FastBlink",
  SolidOn = "SolidOn",
}

export enum SpeakerSound {
  SingleBeep = "single",
  DoubleBeep = "double",
  LongBeep = "long",
  MelodyUp = "melody_up",
  MelodyDown = "melody_down",
}

export class FrontPanel {
  private config: Config;

  private led: Gpio | null = null;
  private switch1: Gpio | null = null;
  private switch2: Gpio | null = null;

  private ledPin: number;
  private speakerBasePin: number;
  private switch1Pin: number;
  private switch2Pin: number;

  private currentLedState: LedState = LedState.Off;
  private ledInterval: NodeJS.Timeout | null = null;

  private switch2PressStartTime: number | null = null;
  private switch2LongPressTimeout: NodeJS.Timeout | null = null;
  private switch2LongPressTriggered: boolean = false;
  private readonly LONG_PRESS_THRESHOLD_MS = 2000;

  private switch1PreviousState: number | null = null;
  private switch1Pressed: (() => void) | null = null;
  private switch1Released: (() => void) | null = null;
  private switch2ShortPress: (() => void) | null = null;
  private switch2LongPress: (() => void) | null = null;

  constructor(config: Config) {
    this.config = config;
    this.ledPin = config.frontPanelGpioPins.led + config.gpioLegacyOffset;
    this.speakerBasePin = config.frontPanelGpioPins.speaker; // Python script will use pin without offset
    this.switch1Pin =
      config.frontPanelGpioPins.switch1 + config.gpioLegacyOffset;
    this.switch2Pin =
      config.frontPanelGpioPins.switch2 + config.gpioLegacyOffset;
  }

  public async initialize(): Promise<void> {
    try {
      this.led = new Gpio(this.ledPin, "out");
      this.led.writeSync(0);

      this.switch1 = new Gpio(this.switch1Pin, "in", "both", {
        debounceTimeout: 500,
      });
      this.switch2 = new Gpio(this.switch2Pin, "in", "both", {
        debounceTimeout: 250,
      });

      this.setupSwitch1Watcher();
      this.setupSwitch2Watcher();

      logger.info("[FrontPanel] Initialized successfully");
    } catch (error) {
      errorLogger.error("[FrontPanel] Failed to initialize GPIO:", error);
      throw error;
    }
  }

  // ============================================
  // Status LED
  // ============================================

  public setLedState(state: LedState): void {
    if (this.currentLedState === state) {
      return;
    }

    this.stopLedPattern();
    this.currentLedState = state;

    if (this.config.disableLED) {
      logger.info(
        `[FrontPanel] LED state changed to: ${state} (LED disabled - logging only)`
      );
      return;
    }

    switch (state) {
      case LedState.Off:
        this.led?.writeSync(0);
        break;
      case LedState.SolidOn:
        this.led?.writeSync(1);
        break;
      case LedState.SlowFlash:
        this.startLedFlash(50, 4950);
        break;
      case LedState.SlowBlink:
        this.startLedBlink(1500);
        break;
      case LedState.FastBlink:
        this.startLedBlink(200);
        break;
    }

    logger.info(`[FrontPanel] LED state changed to: ${state}`);
  }

  private startLedBlink(intervalMs: number): void {
    let value: 0 | 1 = 0;
    this.ledInterval = setInterval(() => {
      value = value === 0 ? 1 : 0;
      this.led?.writeSync(value);
    }, intervalMs);
  }

  private startLedFlash(onTimeMs: number, offTimeMs: number): void {
    const flash = () => {
      this.led?.writeSync(1);

      setTimeout(() => {
        this.led?.writeSync(0);
      }, onTimeMs);
    };

    flash();
    this.ledInterval = setInterval(flash, onTimeMs + offTimeMs);
  }

  private stopLedPattern(): void {
    if (this.ledInterval) {
      clearInterval(this.ledInterval);
      this.ledInterval = null;
    }
  }

  // ============================================
  // Speaker Control
  // ============================================

  private playSound(soundType: SpeakerSound): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = join(__dirname, "playSound.py");
      const python = spawn("python3", [
        scriptPath,
        this.speakerBasePin.toString(),
        soundType,
      ]);

      let stderr = "";

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          errorLogger.error(
            `[FrontPanel] playSound.py exited with code ${code}: ${stderr}`
          );
          reject(new Error(`Python script failed with code ${code}`));
        } else {
          resolve();
        }
      });

      python.on("error", (err) => {
        errorLogger.error("[FrontPanel] Failed to spawn Python process:", err);
        reject(err);
      });
    });
  }

  public async play(sound: SpeakerSound): Promise<void> {
    if (this.config.disableSound) {
      logger.info(
        `[FrontPanel] Sound: ${sound} (Sound disabled - logging only)`
      );
      return;
    }

    try {
      await this.playSound(sound);
    } catch (error) {
      errorLogger.error(`[FrontPanel] Error playing sound ${sound}:`, error);
    }
  }

  public async playSingleBeep(): Promise<void> {
    await this.play(SpeakerSound.SingleBeep);
  }

  public async playDoubleBeep(): Promise<void> {
    await this.play(SpeakerSound.DoubleBeep);
  }

  public async playLongBeep(): Promise<void> {
    await this.play(SpeakerSound.LongBeep);
  }

  public async playMelodyUp(): Promise<void> {
    await this.play(SpeakerSound.MelodyUp);
  }

  public async playMelodyDown(): Promise<void> {
    await this.play(SpeakerSound.MelodyDown);
  }

  // ============================================
  // Switch 1 Methods (On/Off state change)
  // ============================================

  private setupSwitch1Watcher(): void {
    if (!this.switch1) return;

    try {
      this.switch1PreviousState = this.switch1.readSync();
    } catch (error) {
      errorLogger.error(
        "[FrontPanel] Error reading initial switch 1 state:",
        error
      );
      this.switch1PreviousState = null;
    }

    this.switch1.watch((err, value) => {
      if (err) {
        errorLogger.error("[FrontPanel] Switch 1 watch error:", err);
        return;
      }

      if (this.switch1PreviousState === value) {
        return;
      }

      this.switch1PreviousState = value;

      if (value === 0) {
        logger.info("[FrontPanel] Switch 1: State changed to 0 (pressed)");
        this.switch1Pressed?.();
      } else {
        logger.info("[FrontPanel] Switch 1: State changed to 1 (released)");
        this.switch1Released?.();
      }
    });
  }

  public onSwitch1Pressed(handler: () => void): void {
    this.switch1Pressed = handler;
  }

  public onSwitch1Released(handler: () => void): void {
    this.switch1Released = handler;
  }

  public isSwitch1Pressed(): boolean {
    try {
      return this.switch1?.readSync() === 0;
    } catch (error) {
      errorLogger.error("[FrontPanel] Error reading switch 1:", error);
      return false;
    }
  }

  // ============================================
  // Switch 2 Methods (Short/Long press detection)
  // ============================================

  private setupSwitch2Watcher(): void {
    if (!this.switch2) return;

    this.switch2.watch((err, value) => {
      if (err) {
        errorLogger.error("[FrontPanel] Switch 2 watch error:", err);
        return;
      }

      if (value === 0) {
        this.handleSwitch2Pressed();
      } else {
        this.handleSwitch2Released();
      }
    });
  }

  private handleSwitch2Pressed(): void {
    this.switch2PressStartTime = Date.now();
    this.switch2LongPressTriggered = false;

    this.switch2LongPressTimeout = setTimeout(() => {
      this.switch2LongPressTriggered = true;
      logger.info("[FrontPanel] Switch 2: Long press detected");
      this.switch2LongPress?.();
    }, this.LONG_PRESS_THRESHOLD_MS);
  }

  private handleSwitch2Released(): void {
    if (this.switch2LongPressTimeout) {
      clearTimeout(this.switch2LongPressTimeout);
      this.switch2LongPressTimeout = null;
    }

    if (
      this.switch2PressStartTime !== null &&
      !this.switch2LongPressTriggered
    ) {
      const pressDuration = Date.now() - this.switch2PressStartTime;
      logger.info(
        `[FrontPanel] Switch 2: Short press detected (${pressDuration}ms)`
      );
      this.switch2ShortPress?.();
    }

    this.switch2PressStartTime = null;
  }

  public onSwitch2ShortPress(handler: () => void): void {
    this.switch2ShortPress = handler;
  }

  public onSwitch2LongPress(handler: () => void): void {
    this.switch2LongPress = handler;
  }

  // ============================================
  // Utility Methods
  // ============================================

  public async cleanup(): Promise<void> {
    logger.info("[FrontPanel] Cleaning up...");
    this.stopLedPattern();
    if (this.switch2LongPressTimeout) {
      clearTimeout(this.switch2LongPressTimeout);
      this.switch2LongPressTimeout = null;
    }
    if (this.led) {
      try {
        this.led.writeSync(0);
        this.led.unexport();
        logger.info("[FrontPanel] LED GPIO cleaned up");
      } catch (error) {
        errorLogger.error("[FrontPanel] Error cleaning up LED:", error);
      }
    }
    if (this.switch1) {
      try {
        this.switch1.unwatch();
        this.switch1.unexport();
        logger.info("[FrontPanel] Switch 1 GPIO cleaned up");
      } catch (error) {
        errorLogger.error("[FrontPanel] Error cleaning up switch 1:", error);
      }
    }
    if (this.switch2) {
      try {
        this.switch2.unwatch();
        this.switch2.unexport();
        logger.info("[FrontPanel] Switch 2 GPIO cleaned up");
      } catch (error) {
        errorLogger.error("[FrontPanel] Error cleaning up switch 2:", error);
      }
    }

    this.led = null;
    this.switch1 = null;
    this.switch2 = null;
  }
}
