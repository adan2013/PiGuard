import { exec } from "child_process";

export function shutdownRaspberryPi(): void {
  console.log("[PiGuard] Executing system shutdown...");

  exec("sudo shutdown -h now", (error, _stdout, stderr) => {
    if (error) {
      console.error(`[PiGuard] Error executing shutdown: ${error.message}`);
      // Fallback: try without sudo (in case user has permissions)
      exec("shutdown -h now", (error2) => {
        if (error2) {
          console.error(
            `[PiGuard] Error executing shutdown (fallback): ${error2.message}`
          );
          console.error("[PiGuard] Please shutdown the system manually");
          process.exit(1);
        }
      });
      return;
    }
    if (stderr) {
      console.error(`[PiGuard] Shutdown stderr: ${stderr}`);
    }
  });
}
