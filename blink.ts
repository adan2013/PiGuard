import { Gpio } from "onoff";

const GPIO_OFFSET = 512;
const LED_GPIO = 23 + GPIO_OFFSET;
const BUZZER_GPIO = 24 + GPIO_OFFSET;

let led: Gpio | null = null;
let buzzer: Gpio | null = null;
let blinkInterval: NodeJS.Timeout | null = null;

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

function playStartupDoubleBeep() {
  try {
    buzzer = new Gpio(BUZZER_GPIO, "out");

    const beepOn = () => buzzer?.writeSync(1);
    const beepOff = () => buzzer?.writeSync(0);

    // Double quick beep pattern: on 150ms, off 100ms, on 150ms, off
    beepOn();
    setTimeout(() => {
      beepOff();
      setTimeout(() => {
        beepOn();
        setTimeout(() => {
          beepOff();
        }, 150);
      }, 100);
    }, 150);

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
