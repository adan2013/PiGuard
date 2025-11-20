import * as dotenv from "dotenv";
import { PiGuard } from "./PiGuard";

dotenv.config();

const piGuard = new PiGuard();

process.on("SIGINT", async () => {
  console.log("\n[PiGuard] Received SIGINT signal");
  await piGuard.shutdown();
});

process.on("SIGTERM", async () => {
  console.log("\n[PiGuard] Received SIGTERM signal");
  await piGuard.shutdown();
});

process.on("uncaughtException", (error: Error) => {
  console.error("[PiGuard] Uncaught exception:", error);
  piGuard.shutdown();
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error(
    "[PiGuard] Unhandled rejection at:",
    promise,
    "reason:",
    reason
  );
});

piGuard.initialize().catch((error: Error) => {
  console.error("[PiGuard] Failed to start:", error.message);
  process.exit(1);
});
