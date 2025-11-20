import { Gpio } from "onoff";

const GPIO_OFFSET = 512;
const LED_GPIO = 23 + GPIO_OFFSET;

let led: Gpio | null = null;
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
};

startBlink();
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
