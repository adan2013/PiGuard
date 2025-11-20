import { Gpio } from "onoff";

const GPIO_OFFSET = 512;
const LED_GPIO = 23 + GPIO_OFFSET;
const BUZZER_GPIO = 24 + GPIO_OFFSET;

let led: Gpio | null = null;
let buzzer: Gpio | null = null;
let blinkInterval: NodeJS.Timeout | null = null;
let toneInterval: NodeJS.Timeout | null = null;

function startBlink() {
  try {
    led = new Gpio(LED_GPIO, "out");
    let value: 0 | 1 = 0;

    blinkInterval = setInterval(() => {
      value = value === 0 ? 1 : 0;
      led?.writeSync(value);
    }, 1500);

    console.log(
      `[Experiment] Blinking LED on GPIO 23 (actual pin ${LED_GPIO}) every 500ms`
    );
  } catch (error) {
    console.error("[Experiment] Failed to initialize LED GPIO:", error);
  }
}

function playTone(
  durationMs: number,
  frequencyHz: number,
  onDone?: () => void
) {
  try {
    if (!buzzer) {
      buzzer = new Gpio(BUZZER_GPIO, "out");
    }

    const halfPeriodMs = 500 / frequencyHz; // half period in ms (since JS timers are ~1ms resolution)
    let state: 0 | 1 = 0;

    if (toneInterval) {
      clearInterval(toneInterval);
    }

    toneInterval = setInterval(() => {
      state = state === 0 ? 1 : 0;
      buzzer?.writeSync(state);
    }, halfPeriodMs);

    setTimeout(() => {
      if (toneInterval) {
        clearInterval(toneInterval);
        toneInterval = null;
      }
      buzzer?.writeSync(0);
      onDone?.();
    }, durationMs);
  } catch (error) {
    console.error("[Experiment] Error playing tone on buzzer:", error);
    if (toneInterval) {
      clearInterval(toneInterval);
      toneInterval = null;
    }
    try {
      buzzer?.writeSync(0);
    } catch {
      // ignore
    }
    onDone?.();
  }
}

function playStartupDoubleBeep() {
  try {
    if (!buzzer) {
      buzzer = new Gpio(BUZZER_GPIO, "out");
    }

    const toneDuration = 150; // ms
    const gapDuration = 100; // ms
    const frequencyHz = 500; // Hz, suitable for JS timer resolution

    // First tone
    playTone(toneDuration, frequencyHz, () => {
      // Gap between beeps
      setTimeout(() => {
        // Second tone
        playTone(toneDuration, frequencyHz);
      }, gapDuration);
    });

    console.log(
      `[Experiment] Playing startup double beep on GPIO 24 (actual pin ${BUZZER_GPIO})`
    );
  } catch (error) {
    console.error("[Experiment] Failed to initialize buzzer GPIO:", error);
  }
}

const cleanup = () => {
  if (blinkInterval) {
    clearInterval(blinkInterval);
  }
  if (toneInterval) {
    clearInterval(toneInterval);
    toneInterval = null;
  }
  if (led) {
    try {
      led.writeSync(0);
      led.unexport();
      console.log("[Experiment] LED GPIO cleaned up");
    } catch (e) {
      console.error("[Experiment] Error during LED GPIO cleanup:", e);
    }
  }
  if (buzzer) {
    try {
      buzzer.writeSync(0);
      buzzer.unexport();
      console.log("[Experiment] Buzzer GPIO cleaned up");
    } catch (e) {
      console.error("[Experiment] Error during buzzer GPIO cleanup:", e);
    }
  }
};

playStartupDoubleBeep();
startBlink();
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
