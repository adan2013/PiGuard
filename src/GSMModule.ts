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

  constructor(config: Config) {
    this.config = config;
    this.commandQueue = new ATCommandQueue(
      config.atCommandTimeout,
      config.atCommandRetry
    );

    this.commandQueue.setExecutor(this.executeATCommand.bind(this));
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
        console.log(`[GSM] ${test.log}`);
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

      this.diagnostics.lastUpdated = new Date();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[GSM] Connection test failed:", errorMessage);
      throw error;
    }
  }

  public async initialize(): Promise<boolean> {
    console.log("[GSM] Initializing GSM module...");

    try {
      this.port = new SerialPort({
        path: this.config.serialPort,
        baudRate: this.config.serialBaudrate,
        autoOpen: false,
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

      this.parser.on("data", (data: string) => this.handleResponse(data));

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) {
            reject(new Error(`Failed to open serial port: ${err.message}`));
          } else {
            resolve();
          }
        });
      });

      console.log("[GSM] Serial port opened successfully");

      await this.delay(2000);

      await this.sendCommand("AT", "OK");
      await this.sendCommand("ATE0", "OK");
      await this.sendCommand("AT+CMGF=1", "OK");
      await this.sendCommand("AT+CNMI=1,2,0,0,0", "OK");
      await this.sendCommand(`AT+CSCS="GSM"`, "OK");
      await this.performConnectionTest();
      console.log(this.getDetailedStatusReport());

      this.isReady = true;
      console.log("[GSM] GSM module initialized successfully");

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[GSM] Initialization failed:", errorMessage);
      throw error;
    }
  }

  private handleResponse(data: string): void {
    const trimmedData = data.trim();

    if (!trimmedData) return;

    console.log(`[GSM] << ${trimmedData}`);

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

  public sendCommand(
    command: string,
    expectedResponse: string | null = "OK"
  ): Promise<string> {
    if (!this.port || !this.port.isOpen) {
      return Promise.reject(new Error("Serial port not open"));
    }

    return this.commandQueue.add(command, expectedResponse);
  }

  private executeATCommand(commandObj: {
    command: string;
    expectedResponse: string | null;
    skipCRLF?: boolean;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const { command, expectedResponse, skipCRLF } = commandObj;

      if (skipCRLF && command.includes(String.fromCharCode(26))) {
        console.log(`[GSM] >> ${command.replace(/\x1A/g, "<CTRL+Z>")}`);
      } else {
        console.log(`[GSM] >> ${command}`);
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

    console.log(`[GSM] Sending SMS to ${phoneNumber}: ${message}`);

    try {
      if (performConnectionTest) {
        await this.performConnectionTest();
      }
      console.log("[GSM] Sending SMS...");
      await this.sendCommand(`AT+CMGS="${phoneNumber}"`, null);

      await this.delay(600);
      await this.executeATCommand({
        command: message + String.fromCharCode(26),
        expectedResponse: "OK",
        skipCRLF: true,
      });

      console.log(`[GSM] SMS sent successfully to ${phoneNumber}`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
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

    console.log(`[GSM] Sending to all: ${message}`);
    const results: SMSResult[] = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        await this.sendSMS(phoneNumber, message, false);
        results.push({ phoneNumber, success: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`[GSM] Failed to send to ${phoneNumber}:`, errorMessage);
        results.push({ phoneNumber, success: false, error: errorMessage });
      }
    }

    return results;
  }

  public async close(): Promise<void> {
    console.log("[GSM] Closing GSM module...");

    this.commandQueue.clear();

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve) => {
        this.port!.close((err) => {
          if (err) {
            console.error("[GSM] Error closing port:", err.message);
          }
          resolve();
        });
      });
    }

    this.isReady = false;
    console.log("[GSM] GSM module closed");
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

  public getDetailedStatusReport(): string {
    return getDetailedStatusReport(this.diagnostics);
  }

  public getCompactStatusReport(): string {
    return getCompactStatusReport(this.diagnostics);
  }
}
