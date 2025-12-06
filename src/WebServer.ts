import express, { Request, Response } from "express";
import { Server } from "http";
import { readFile, writeFile, existsSync } from "fs";
import { join } from "path";
import { PiGuard } from "./PiGuard";
import { shutdownRaspberryPi, rebootRaspberryPi } from "./utils/shutdownUtils";
import { logger, errorLogger } from "./utils/logger";

export class WebServer {
  private app: express.Application;
  private server: Server | null = null;
  private piGuard: PiGuard;
  private port: number;

  constructor(piGuard: PiGuard, port: number = 8080) {
    this.app = express();
    this.piGuard = piGuard;
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(join(process.cwd(), "public")));
  }

  private setupRoutes(): void {
    this.app.get("/api/logs", this.getLogs.bind(this));
    this.app.get("/api/gsm-config", this.getGSMConfig.bind(this));
    this.app.get("/api/inputs", this.getInputs.bind(this));
    this.app.get("/api/status", this.getSystemStatus.bind(this));
    this.app.get("/api/env", this.getEnvFile.bind(this));
    this.app.post("/api/env", this.saveEnvFile.bind(this));
    this.app.post(
      "/api/send-diagnostic-sms",
      this.sendDiagnosticSMS.bind(this)
    );
    this.app.post("/api/shutdown", this.shutdownSystem.bind(this));
    this.app.post("/api/reboot", this.rebootSystem.bind(this));
    this.app.get("/", (_req: Request, res: Response) => {
      res.sendFile(join(process.cwd(), "public", "index.html"));
    });
  }

  private async getLogs(_req: Request, res: Response): Promise<void> {
    try {
      const logFile = join(process.cwd(), "logs", "piguard.log");
      const errorLogFile = join(process.cwd(), "logs", "piguard-error.log");
      const lines = 1000;

      const readLogFile = (filePath: string): Promise<string[]> => {
        return new Promise((resolve, reject) => {
          if (!existsSync(filePath)) {
            resolve([]);
            return;
          }

          readFile(filePath, "utf8", (err, data) => {
            if (err) {
              reject(err);
              return;
            }

            const logLines = data.split("\n").filter((line) => line.trim());
            const recentLogs = logLines.slice(-lines);
            resolve(recentLogs);
          });
        });
      };

      try {
        const [logs, errorLogs] = await Promise.all([
          readLogFile(logFile),
          readLogFile(errorLogFile),
        ]);

        res.json({ logs, errorLogs });
      } catch (error) {
        errorLogger.error("[WebServer] Error reading log files:", error);
        res.status(500).json({ error: "Failed to read log files" });
      }
    } catch (error) {
      errorLogger.error("[WebServer] Error getting logs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async getGSMConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = this.piGuard.getConfig();
      const gsm = this.piGuard.getGSM();

      let diagnostics = {};
      let status: {
        isReady: boolean;
        portOpen: boolean;
        queueStatus: any;
      } = {
        isReady: false,
        portOpen: false,
        queueStatus: {},
      };

      try {
        diagnostics = gsm.getDiagnostics();
        status = gsm.getStatus();
      } catch (error) {
        logger.warn(
          "[WebServer] GSM module not initialized, returning default status"
        );
      }

      const response = {
        serialPort: config.serialPort,
        serialBaudrate: config.serialBaudrate,
        phoneNumbers: config.phoneNumbers,
        atCommandTimeout: config.atCommandTimeout,
        atCommandRetry: config.atCommandRetry,
        disableWelcomeSMS: config.disableWelcomeSMS,
        disableAlertSMS: config.disableAlertSMS,
        smsCooldownPeriod: config.smsCooldownPeriod,
        status: {
          isReady: status.isReady,
          portOpen: status.portOpen,
          queueStatus: status.queueStatus,
        },
        diagnostics: diagnostics,
      };

      res.json(response);
    } catch (error) {
      errorLogger.error("[WebServer] Error getting GSM config:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async getInputs(_req: Request, res: Response): Promise<void> {
    try {
      const inputs = this.piGuard.getInputStates();
      const mappedInputs = inputs.map((input) => ({
        number: input.number,
        name: input.name,
        state: input.state ? "DETECTED" : "CLEAR",
      }));
      res.json({ inputs: mappedInputs });
    } catch (error) {
      errorLogger.error("[WebServer] Error getting inputs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async getSystemStatus(_req: Request, res: Response): Promise<void> {
    try {
      const config = this.piGuard.getConfig();
      const status = this.piGuard.getStatus();
      const uptime = config.getUptimeValue();

      res.json({
        uptime: {
          days: uptime.days,
          hours: uptime.hours,
        },
        running: status.running,
        inCooldown: status.inCooldown,
      });
    } catch (error) {
      errorLogger.error("[WebServer] Error getting system status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async sendDiagnosticSMS(_req: Request, res: Response): Promise<void> {
    try {
      await this.piGuard.sendDiagnosticSMS();
      res.json({
        success: true,
        message: "Diagnostic SMS sent successfully",
      });
    } catch (error) {
      errorLogger.error("[WebServer] Error sending diagnostic SMS:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async getEnvFile(_req: Request, res: Response): Promise<void> {
    try {
      const envPath = join(process.cwd(), ".env");

      if (!existsSync(envPath)) {
        res.status(404).json({ error: ".env file not found" });
        return;
      }

      readFile(envPath, "utf8", (err, data) => {
        if (err) {
          errorLogger.error("[WebServer] Error reading .env file:", err);
          res.status(500).json({ error: "Failed to read .env file" });
          return;
        }

        res.json({ content: data });
      });
    } catch (error) {
      errorLogger.error("[WebServer] Error getting .env file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async saveEnvFile(req: Request, res: Response): Promise<void> {
    try {
      const { content, reboot } = req.body;

      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "Invalid content" });
        return;
      }

      const envPath = join(process.cwd(), ".env");

      writeFile(envPath, content, "utf8", (err) => {
        if (err) {
          errorLogger.error("[WebServer] Error writing .env file:", err);
          res.status(500).json({ error: "Failed to save .env file" });
          return;
        }

        logger.info("[WebServer] .env file saved successfully");

        if (reboot) {
          logger.info("[WebServer] Rebooting system as requested...");
          setTimeout(() => {
            rebootRaspberryPi();
          }, 1000);
        }

        res.json({
          success: true,
          message: reboot ? "Saved and rebooting..." : "Saved successfully",
        });
      });
    } catch (error) {
      errorLogger.error("[WebServer] Error saving .env file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async shutdownSystem(_req: Request, res: Response): Promise<void> {
    try {
      logger.warn("[WebServer] Shutdown requested via web interface");
      res.json({ success: true, message: "Shutting down..." });

      setTimeout(async () => {
        await this.piGuard.getFrontPanel().playMelodyDown();
        shutdownRaspberryPi();
      }, 1000);
    } catch (error) {
      errorLogger.error("[WebServer] Error shutting down:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async rebootSystem(_req: Request, res: Response): Promise<void> {
    try {
      logger.warn("[WebServer] Reboot requested via web interface");
      res.json({ success: true, message: "Rebooting..." });

      setTimeout(async () => {
        await this.piGuard.getFrontPanel().playMelodyDown();
        rebootRaspberryPi();
      }, 1000);
    } catch (error) {
      errorLogger.error("[WebServer] Error rebooting:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  public start(): void {
    this.server = this.app.listen(this.port, () => {
      logger.info(`[WebServer] Web server started on port ${this.port}`);
      logger.info(`[WebServer] Access the UI at http://localhost:${this.port}`);
    });
  }

  public stop(callback?: () => void): void {
    if (this.server) {
      this.server.close(() => {
        logger.info("[WebServer] Web server stopped");
        if (callback) {
          callback();
        }
      });
    } else {
      if (callback) {
        callback();
      }
    }
  }
}
