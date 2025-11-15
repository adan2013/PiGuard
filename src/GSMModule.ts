import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { ATCommandQueue } from "./ATCommandQueue";
import { Config } from "./Config";
import { PendingCommand, SMSResult, GSMStatus } from "./types";

export { SMSResult, GSMStatus };

export class GSMModule {
  private config: Config;
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private responseBuffer: string = "";
  private commandQueue: ATCommandQueue;
  private isReady: boolean = false;
  private pendingCommand: PendingCommand | null = null;

  constructor(config: Config) {
    this.config = config;
    this.commandQueue = new ATCommandQueue(
      config.atCommandTimeout,
      config.atCommandRetry
    );

    this.commandQueue.setExecutor(this.executeATCommand.bind(this));
  }

  public async initialize(): Promise<boolean> {
    console.log("[GSM] Initializing GSM module...");

    try {
      const serialConfig = this.config.getSerialConfig();
      this.port = new SerialPort({
        path: serialConfig.path,
        baudRate: serialConfig.baudRate,
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

      await this.checkNetworkRegistration();

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
    expectedResponse: string = "OK"
  ): Promise<string> {
    if (!this.port || !this.port.isOpen) {
      return Promise.reject(new Error("Serial port not open"));
    }

    return this.commandQueue.add(command, expectedResponse);
  }

  private executeATCommand(commandObj: {
    command: string;
    expectedResponse: string;
    skipCRLF?: boolean;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const { command, expectedResponse, skipCRLF } = commandObj;

      if (skipCRLF && command.includes(String.fromCharCode(26))) {
        console.log(`[GSM] >> (RAW) ${command.replace(/\x1A/g, "<CTRL+Z>")}`);
      } else {
        console.log(`[GSM] >> ${command}`);
      }

      this.responseBuffer = "";

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

      const dataToWrite = skipCRLF ? command : command + "\r\n";

      this.port!.write(dataToWrite, (err) => {
        if (err) {
          clearTimeout(timeoutHandle);
          this.pendingCommand = null;
          reject(new Error(`Failed to write command: ${err.message}`));
        }
      });
    });
  }

  public async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.isReady) {
      throw new Error("GSM module not ready");
    }

    console.log(`[GSM] Sending SMS to ${phoneNumber}: ${message}`);

    try {
      await this.sendCommand(`AT+CMGS="${phoneNumber}"`, ">");

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

  public async sendAlert(triggerName: string): Promise<SMSResult[]> {
    const phoneNumbers = this.config.getPhoneNumbers();

    if (phoneNumbers.length === 0) {
      return [];
    }

    const timestamp = new Date().toLocaleString();
    const message = `ALERT: ${triggerName} triggered at ${timestamp}`;

    console.log(`[GSM] Sending alert: ${message}`);

    const results: SMSResult[] = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        await this.sendSMS(phoneNumber, message);
        results.push({ phoneNumber, success: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[GSM] Failed to send alert to ${phoneNumber}:`,
          errorMessage
        );
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

  private async checkNetworkRegistration(): Promise<void> {
    try {
      await this.sendCommand("AT+CREG?", "OK");
    } catch (error) {}
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
}
