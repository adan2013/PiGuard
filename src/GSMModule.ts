import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { ATCommandQueue } from "./ATCommandQueue";
import { Config } from "./Config";
import { PendingCommand, SMSResult, GSMStatus, GSMDiagnostics } from "./types";
import {
  extractDiagnosticsFromResponse,
  getDetailedStatusReport,
  getCompactStatusReport,
} from "./utils/gsmDiagnosticsUtils";
import { logger, errorLogger } from "./utils/logger";

export { SMSResult, GSMStatus, GSMDiagnostics };

export class GSMModule {
  private config: Config;
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private responseBuffer: string = "";
  private commandQueue: ATCommandQueue;
  private isReady: boolean = false;
  private pendingCommand: PendingCommand | null = null;
  private diagnostics: GSMDiagnostics = {};
  private isReconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

  constructor(config: Config) {
    this.config = config;
    this.commandQueue = new ATCommandQueue(
      config.atCommandTimeout,
      config.atCommandRetry
    );

    this.commandQueue.setExecutor(async (commandObj) => {
      return await this.executeATCommand({
        command: commandObj.command,
        expectedResponse: commandObj.expectedResponse,
        skipCRLF: false,
      });
    });
  }

  public async performConnectionTest() {
    try {
      const tests = [
        {
          command: "AT+CPIN?",
          expectedResponse: "+CPIN:",
          log: "Checking PIN...",
        },
        {
          command: "AT+CMGF?",
          expectedResponse: "+CMGF:",
          log: "Checking mode...",
        },
        {
          command: "AT+CREG?",
          expectedResponse: "+CREG:",
          log: "Checking network registration...",
        },
        {
          command: "AT+CSQ",
          expectedResponse: "+CSQ:",
          log: "Checking signal quality...",
        },
        {
          command: "AT+CSCA?",
          expectedResponse: "+CSCA:",
          log: "Checking SC Address...",
        },
        {
          command: "AT+COPS?",
          expectedResponse: "+COPS:",
          log: "Checking current operator...",
        },
      ];

      for (const test of tests) {
        logger.info(`[GSM] ${test.log}`);
        const response = await this.sendCommand(
          test.command,
          test.expectedResponse
        );
        const diagnostics = extractDiagnosticsFromResponse(
          test.command,
          response
        );
        Object.assign(this.diagnostics, diagnostics);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error("[GSM] Connection test failed:", errorMessage);
      throw error;
    }
  }

  public async initialize(): Promise<boolean> {
    logger.info("[GSM] Initializing GSM module...");

    try {
      this.port = new SerialPort({
        path: this.config.serialPort,
        baudRate: this.config.serialBaudrate,
        autoOpen: false,
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

      this.parser.on("data", (data: string) => this.handleResponse(data));

      this.setupPortEventHandlers();

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) {
            reject(new Error(`Failed to open serial port: ${err.message}`));
          } else {
            resolve();
          }
        });
      });

      logger.info("[GSM] Serial port opened successfully");

      await this.delay(2000);

      await this.sendCommand("AT", "OK");
      await this.sendCommand("ATE0", "OK");
      await this.sendCommand("AT+CMGF=1", "OK");
      await this.sendCommand("AT+CNMI=1,2,0,0,0", "OK");
      await this.sendCommand(`AT+CSCS="GSM"`, "OK");
      await this.performConnectionTest();
      const statusReport = this.getDetailedStatusReport(this.config);
      logger.info(`\n${statusReport}\n`);
      logger.info(`[GSM] GSM module initialized successfully`);
      this.isReady = true;

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error("[GSM] Initialization failed:", errorMessage);
      throw error;
    }
  }

  private setupPortEventHandlers(): void {
    if (!this.port) return;

    this.port.on("close", () => {
      logger.warn("[GSM] Serial port closed unexpectedly");
      this.isReady = false;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;

      if (this.pendingCommand) {
        clearTimeout(this.pendingCommand.timeoutHandle);
        this.pendingCommand.reject(
          new Error("Serial port closed during command execution")
        );
        this.pendingCommand = null;
      }
      this.commandQueue.clear();
    });

    this.port.on("error", (err: Error) => {
      errorLogger.error("[GSM] Serial port error:", err.message);
      this.isReady = false;

      if (this.pendingCommand) {
        clearTimeout(this.pendingCommand.timeoutHandle);
        this.pendingCommand.reject(
          new Error(`Serial port error: ${err.message}`)
        );
        this.pendingCommand = null;
      }
    });
  }

  private async ensurePortOpen(): Promise<void> {
    if (this.port && this.port.isOpen) {
      return;
    }

    if (this.isReconnecting) {
      let waitCount = 0;
      while (this.isReconnecting && waitCount < 50) {
        await this.delay(100);
        waitCount++;
        if (this.port && this.port.isOpen) {
          return;
        }
      }
      if (!this.port || !this.port.isOpen) {
        throw new Error("Serial port reconnection timeout");
      }
      return;
    }

    await this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    const initialAttempts = this.reconnectAttempts;

    while (
      this.reconnectAttempts - initialAttempts <
      this.MAX_RECONNECT_ATTEMPTS
    ) {
      this.reconnectAttempts++;
      const attemptNumber = this.reconnectAttempts - initialAttempts;

      logger.info(
        `[GSM] Attempting to reconnect serial port (attempt ${attemptNumber}/${this.MAX_RECONNECT_ATTEMPTS})...`
      );

      try {
        if (this.port) {
          try {
            if (this.port.isOpen) {
              await new Promise<void>((resolve) => {
                this.port!.close(() => resolve());
              });
            }
          } catch (error) {}
          this.port = null;
          this.parser = null;
        }

        this.port = new SerialPort({
          path: this.config.serialPort,
          baudRate: this.config.serialBaudrate,
          autoOpen: false,
        });

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
        this.parser.on("data", (data: string) => this.handleResponse(data));
        this.setupPortEventHandlers();

        await new Promise<void>((resolve, reject) => {
          this.port!.open((err) => {
            if (err) {
              reject(new Error(`Failed to reopen serial port: ${err.message}`));
            } else {
              resolve();
            }
          });
        });

        logger.info("[GSM] Serial port reconnected successfully");

        await this.delay(2000);
        await this.executeATCommandDirectly("AT", "OK");
        await this.executeATCommandDirectly("ATE0", "OK");
        await this.executeATCommandDirectly("AT+CMGF=1", "OK");
        await this.executeATCommandDirectly("AT+CNMI=1,2,0,0,0", "OK");
        await this.executeATCommandDirectly(`AT+CSCS="GSM"`, "OK");

        this.isReady = true;
        this.reconnectAttempts = 0;
        logger.info("[GSM] GSM module reinitialized after reconnection");
        this.isReconnecting = false;
        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errorLogger.error(
          `[GSM] Reconnection attempt ${attemptNumber} failed:`,
          errorMessage
        );

        if (attemptNumber >= this.MAX_RECONNECT_ATTEMPTS) {
          this.isReconnecting = false;
          this.reconnectAttempts = 0;
          throw new Error(
            `Failed to reconnect serial port after ${this.MAX_RECONNECT_ATTEMPTS} attempts`
          );
        }

        await this.delay(2000);
      }
    }

    this.isReconnecting = false;
    throw new Error(
      `Failed to reconnect serial port after ${this.MAX_RECONNECT_ATTEMPTS} attempts`
    );
  }

  private async executeATCommandDirectly(
    command: string,
    expectedResponse: string | null = "OK"
  ): Promise<string> {
    if (!this.port || !this.port.isOpen) {
      throw new Error("Serial port not open");
    }

    return new Promise((resolve, reject) => {
      if (command.includes(String.fromCharCode(26))) {
        logger.info(`[GSM] >> ${command.replace(/\x1A/g, "<CTRL+Z>")}`);
      } else {
        logger.info(`[GSM] >> ${command}`);
      }

      this.responseBuffer = "";

      const dataToWrite = command + "\r\n";

      // If expectedResponse is null, don't wait for response, resolve immediately
      if (expectedResponse === null) {
        this.port!.write(dataToWrite, (err) => {
          if (err) {
            reject(new Error(`Failed to write command: ${err.message}`));
          } else {
            resolve("");
          }
        });
        return;
      }

      const timeoutHandle = setTimeout(() => {
        this.pendingCommand = null;
        reject(new Error(`Command timeout: ${command}`));
      }, this.config.atCommandTimeout);

      this.pendingCommand = {
        command,
        expectedResponse,
        timeoutHandle,
        resolve,
        reject,
      };

      this.port!.write(dataToWrite, (err) => {
        if (err) {
          clearTimeout(timeoutHandle);
          this.pendingCommand = null;
          reject(new Error(`Failed to write command: ${err.message}`));
        }
      });
    });
  }

  private handleResponse(data: string): void {
    const trimmedData = data.trim();

    if (!trimmedData) return;

    logger.info(`[GSM] << ${trimmedData}`);

    this.responseBuffer += trimmedData + "\n";

    if (this.pendingCommand) {
      const { expectedResponse, timeoutHandle, resolve, reject } =
        this.pendingCommand;

      // If expectedResponse is null, we shouldn't have a pending command
      if (expectedResponse === null) {
        return;
      }

      if (trimmedData.includes("ERROR") || trimmedData.includes("FAIL")) {
        clearTimeout(timeoutHandle);
        this.pendingCommand = null;
        reject(new Error(trimmedData));
        return;
      }

      if (
        trimmedData.includes(expectedResponse) ||
        trimmedData === expectedResponse
      ) {
        clearTimeout(timeoutHandle);
        const response = this.responseBuffer;
        this.responseBuffer = "";
        this.pendingCommand = null;
        resolve(response);
        return;
      }

      if (expectedResponse === ">" && trimmedData === ">") {
        clearTimeout(timeoutHandle);
        this.pendingCommand = null;
        resolve(">");
        return;
      }
    }
  }

  public async sendCommand(
    command: string,
    expectedResponse: string | null = "OK"
  ): Promise<string> {
    await this.ensurePortOpen();
    if (!this.port || !this.port.isOpen) {
      return Promise.reject(new Error("Serial port not open"));
    }

    return this.commandQueue.add(command, expectedResponse);
  }

  private async executeATCommand(commandObj: {
    command: string;
    expectedResponse: string | null;
    skipCRLF?: boolean;
  }): Promise<string> {
    await this.ensurePortOpen();
    if (!this.port || !this.port.isOpen) {
      throw new Error("Serial port not open");
    }

    return new Promise((resolve, reject) => {
      const { command, expectedResponse, skipCRLF } = commandObj;

      if (skipCRLF && command.includes(String.fromCharCode(26))) {
        logger.info(`[GSM] >> ${command.replace(/\x1A/g, "<CTRL+Z>")}`);
      } else {
        logger.info(`[GSM] >> ${command}`);
      }

      this.responseBuffer = "";

      const dataToWrite = skipCRLF ? command : command + "\r\n";

      // If expectedResponse is null, don't wait for response, resolve immediately
      if (expectedResponse === null) {
        this.port!.write(dataToWrite, (err) => {
          if (err) {
            reject(new Error(`Failed to write command: ${err.message}`));
          } else {
            resolve("");
          }
        });
        return;
      }

      const timeoutHandle = setTimeout(() => {
        this.pendingCommand = null;
        reject(new Error(`Command timeout: ${command}`));
      }, this.config.atCommandTimeout);

      this.pendingCommand = {
        command,
        expectedResponse,
        timeoutHandle,
        resolve,
        reject,
      };

      this.port!.write(dataToWrite, (err) => {
        if (err) {
          clearTimeout(timeoutHandle);
          this.pendingCommand = null;
          reject(new Error(`Failed to write command: ${err.message}`));
        }
      });
    });
  }

  private async sendSMS(
    phoneNumber: string,
    message: string,
    performConnectionTest: boolean = true
  ): Promise<boolean> {
    if (!this.isReady) {
      throw new Error("GSM module not ready");
    }

    logger.info(`[GSM] Sending SMS to ${phoneNumber}: ${message}`);

    try {
      if (performConnectionTest) {
        await this.performConnectionTest();
      }
      logger.info("[GSM] Sending SMS...");
      await this.sendCommand(`AT+CMGS="${phoneNumber}"`, null);

      await this.delay(600);
      await this.executeATCommand({
        command: message + String.fromCharCode(26),
        expectedResponse: "OK",
        skipCRLF: true,
      });

      logger.info(`[GSM] SMS sent successfully to ${phoneNumber}`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error(
        `[GSM] Failed to send SMS to ${phoneNumber}:`,
        errorMessage
      );
      throw error;
    }
  }

  public async sendToAll(message: string): Promise<SMSResult[]> {
    const phoneNumbers = this.config.phoneNumbers;

    if (phoneNumbers.length === 0) {
      return [];
    }

    logger.info(`[GSM] Sending to all: ${message}`);
    const results: SMSResult[] = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        await this.sendSMS(phoneNumber, message, false);
        results.push({ phoneNumber, success: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errorLogger.error(
          `[GSM] Failed to send to ${phoneNumber}:`,
          errorMessage
        );
        results.push({ phoneNumber, success: false, error: errorMessage });
      }
    }

    return results;
  }

  public async close(): Promise<void> {
    logger.info("[GSM] Closing GSM module...");

    this.commandQueue.clear();

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve) => {
        this.port!.close((err) => {
          if (err) {
            errorLogger.error("[GSM] Error closing port:", err.message);
          }
          resolve();
        });
      });
    }

    this.isReady = false;
    logger.info("[GSM] GSM module closed");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public getStatus(): GSMStatus {
    return {
      isReady: this.isReady,
      portOpen: this.port ? this.port.isOpen : false,
      queueStatus: this.commandQueue.getStatus(),
    };
  }

  public getDiagnostics(): GSMDiagnostics {
    return { ...this.diagnostics };
  }

  public getDetailedStatusReport(config: Config): string {
    return getDetailedStatusReport(this.diagnostics, config);
  }

  public getCompactStatusReport(activeTriggers: Set<string>): string {
    const inputs = [
      activeTriggers.has("trigger1"),
      activeTriggers.has("trigger2"),
      activeTriggers.has("trigger3"),
    ];
    return getCompactStatusReport(this.diagnostics, this.config, inputs);
  }
}
