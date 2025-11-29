import * as dotenv from "dotenv";
import { PiGuard } from "./PiGuard";
import { WebServer } from "./WebServer";
import { logger, errorLogger } from "./utils/logger";

dotenv.config();

const piGuard = new PiGuard();
let webServer: WebServer | null = null;

const webPort = parseInt(process.env.WEB_PORT || "8080", 10);
webServer = new WebServer(piGuard.getConfig(), piGuard.getGSM(), webPort);
webServer.start();

process.on("SIGINT", async () => {
  logger.warn("\n[PiGuard] Received SIGINT signal");
  if (webServer) {
    webServer.stop();
  }
  await piGuard.shutdown();
});

process.on("SIGTERM", async () => {
  logger.warn("\n[PiGuard] Received SIGTERM signal");
  if (webServer) {
    webServer.stop();
  }
  await piGuard.shutdown();
});

process.on("uncaughtException", (error: Error) => {
  errorLogger.error("[PiGuard] Uncaught exception:", error);
  if (webServer) {
    webServer.stop();
  }
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
  errorLogger.error(
    "[PiGuard] Web server is still available for troubleshooting"
  );
});
