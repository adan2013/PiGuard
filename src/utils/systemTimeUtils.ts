import { exec } from "child_process";
import { promisify } from "util";
import { logger, errorLogger } from "./logger";

const execAsync = promisify(exec);

/**
 * Get the current system time from Raspberry Pi
 * @returns Promise<string> System time in ISO format (YYYY-MM-DDTHH:MM:SS) in local time
 */
export async function getSystemTime(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("date +%Y-%m-%dT%H:%M:%S");
    return stdout.trim();
  } catch (error) {
    errorLogger.error("[PiGuard] Error getting system time:", error);
    return null;
  }
}

/**
 * Set the system time on Raspberry Pi
 * @param timestamp ISO format timestamp (YYYY-MM-DDTHH:MM:SS) or Unix timestamp in milliseconds
 * @returns Promise<void>
 */
export async function setSystemTime(timestamp: string | number): Promise<void> {
  try {
    let dateString: string;

    if (typeof timestamp === "number") {
      // Convert Unix timestamp (milliseconds) to date string
      // Use local time from the timestamp (which is in device's local timezone)
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      dateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
      // Parse ISO format timestamp (YYYY-MM-DDTHH:MM:SS) - treat as local time components
      // If it's already in the correct format, parse it directly
      if (timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
        // Direct format: YYYY-MM-DDTHH:MM:SS - extract components directly
        const [datePart, timePart] = timestamp.split("T");
        dateString = `${datePart} ${timePart}`;
      } else {
        // Try parsing as ISO string with timezone
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          throw new Error("Invalid timestamp format");
        }
        // Use local time from the timestamp
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        dateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
    }

    logger.info(`[PiGuard] Setting system time to: ${dateString}`);

    const command = `sudo date -s "${dateString}"`;
    const { stderr } = await execAsync(command);

    if (stderr) {
      errorLogger.error(`[PiGuard] Date command stderr: ${stderr}`);
    }

    // Also sync hardware clock if available
    try {
      await execAsync("sudo hwclock -w");
      logger.info("[PiGuard] Hardware clock synchronized");
    } catch (hwError) {
      logger.warn(
        "[PiGuard] Could not sync hardware clock (may not be available)"
      );
    }

    logger.info("[PiGuard] System time set successfully");
  } catch (error) {
    errorLogger.error("[PiGuard] Error setting system time:", error);
    throw new Error("Failed to set system time");
  }
}
