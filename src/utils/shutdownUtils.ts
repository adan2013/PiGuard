import { exec } from "child_process";
import { logger, errorLogger } from "./logger";

export function shutdownRaspberryPi(): void {
  logger.warn("[PiGuard] Executing system shutdown...");

  exec("sudo shutdown -h now", (error, _stdout, stderr) => {
    if (error) {
      errorLogger.error(`[PiGuard] Error executing shutdown: ${error.message}`);
      // Fallback: try without sudo (in case user has permissions)
      exec("shutdown -h now", (error2) => {
        if (error2) {
          errorLogger.error(
            `[PiGuard] Error executing shutdown (fallback): ${error2.message}`
          );
          errorLogger.error("[PiGuard] Please shutdown the system manually");
          process.exit(1);
        }
      });
      return;
    }
    if (stderr) {
      errorLogger.error(`[PiGuard] Shutdown stderr: ${stderr}`);
    }
  });
}

export function rebootRaspberryPi(): void {
  logger.warn("[PiGuard] Executing system reboot...");

  exec("sudo reboot", (error, _stdout, stderr) => {
    if (error) {
      errorLogger.error(`[PiGuard] Error executing reboot: ${error.message}`);
      // Fallback: try without sudo (in case user has permissions)
      exec("reboot", (error2) => {
        if (error2) {
          errorLogger.error(
            `[PiGuard] Error executing reboot (fallback): ${error2.message}`
          );
          errorLogger.error("[PiGuard] Please reboot the system manually");
          process.exit(1);
        }
      });
      return;
    }
    if (stderr) {
      errorLogger.error(`[PiGuard] Reboot stderr: ${stderr}`);
    }
  });
}
