import * as dotenv from "dotenv";
import { PiGuard } from "./PiGuard";
import { logger, errorLogger } from "./utils/logger";

dotenv.config();

const piGuard = new PiGuard();

process.on("SIGINT", async () => {
  logger.info("\n[PiGuard] Received SIGINT signal");
  await piGuard.shutdown();
});

process.on("SIGTERM", async () => {
  logger.info("\n[PiGuard] Received SIGTERM signal");
  await piGuard.shutdown();
});

process.on("uncaughtException", (error: Error) => {
  errorLogger.error("[PiGuard] Uncaught exception:", error);
  piGuard.shutdown();
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  errorLogger.error(
    "[PiGuard] Unhandled rejection at:",
    promise,
    "reason:",
    reason
  );
});

piGuard.initialize().catch((error: Error) => {
  errorLogger.error("[PiGuard] Failed to start:", error.message);
  process.exit(1);
});
