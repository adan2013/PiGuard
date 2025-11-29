import log4js from "log4js";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

// Ensure logs directory exists
const logsDir = join(process.cwd(), "logs");
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Configure log4js
log4js.configure({
  appenders: {
    console: {
      type: "console",
      layout: {
        type: "pattern",
        pattern: "%[%d{yyyy-MM-dd hh:mm:ss} %p%] %m",
      },
    },
    file: {
      type: "file",
      filename: join(process.cwd(), "logs", "piguard.log"),
      maxLogSize: 10485760, // 10MB
      backups: 5,
      compress: true,
      layout: {
        type: "pattern",
        pattern: "%d{yyyy-MM-dd hh:mm:ss} [%p] %m",
      },
    },
    errorFile: {
      type: "file",
      filename: join(process.cwd(), "logs", "piguard-error.log"),
      maxLogSize: 10485760, // 10MB
      backups: 5,
      compress: true,
      layout: {
        type: "pattern",
        pattern: "%d{yyyy-MM-dd hh:mm:ss} [%p] %m",
      },
    },
  },
  categories: {
    default: {
      appenders: ["console", "file"],
      level: "info",
    },
    error: {
      appenders: ["console", "file", "errorFile"],
      level: "error",
    },
  },
});

// Export logger instance
export const logger = log4js.getLogger();

// Export error logger
export const errorLogger = log4js.getLogger("error");
