import { CommandObject, QueueStatus, CommandExecutor } from "./types";
import { logger, errorLogger } from "./utils/logger";

export class ATCommandQueue {
  private queue: CommandObject[] = [];
  private processing: boolean = false;
  private maxRetries: number;
  private currentCommand: CommandObject | null = null;
  private executor?: CommandExecutor;

  constructor(_timeout: number = 5000, maxRetries: number = 3) {
    this.maxRetries = maxRetries;
  }

  public add(
    command: string,
    expectedResponse: string | null = "OK"
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const commandObj: CommandObject = {
        command,
        expectedResponse,
        resolve,
        reject,
        retries: 0,
        timestamp: Date.now(),
      };
      this.queue.push(commandObj);

      if (!this.processing) {
        this.processNext();
      }
    });
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      this.currentCommand = null;
      return;
    }

    this.processing = true;
    this.currentCommand = this.queue.shift()!;

    logger.info(`[ATQueue] Processing: ${this.currentCommand.command}`);

    try {
      const response = await this.executeCommand(this.currentCommand);
      logger.info(`[ATQueue] Success: ${this.currentCommand.command}`);
      this.currentCommand.resolve(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorLogger.error(
        `[ATQueue] Error: ${this.currentCommand.command} - ${errorMessage}`
      );

      if (this.currentCommand.retries < this.maxRetries) {
        this.currentCommand.retries++;
        logger.info(
          `[ATQueue] Retrying (${this.currentCommand.retries}/${this.maxRetries}): ${this.currentCommand.command}`
        );
        this.queue.unshift(this.currentCommand);
      } else {
        errorLogger.error(
          `[ATQueue] Max retries exceeded for: ${this.currentCommand.command}`
        );
        this.currentCommand.reject(
          error instanceof Error ? error : new Error(errorMessage)
        );
      }
    }

    setImmediate(() => this.processNext());
  }

  private async executeCommand(commandObj: CommandObject): Promise<string> {
    if (this.executor) {
      return await this.executor(commandObj);
    }
    throw new Error("No executor function set for ATCommandQueue");
  }

  public setExecutor(executor: CommandExecutor): void {
    this.executor = executor;
  }

  public clear(): void {
    logger.info(`[ATQueue] Clearing queue (${this.queue.length} commands)`);
    this.queue.forEach((cmd) => {
      cmd.reject(new Error("Queue cleared"));
    });
    this.queue = [];
    this.processing = false;
    this.currentCommand = null;
  }

  public getStatus(): QueueStatus {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      currentCommand: this.currentCommand ? this.currentCommand.command : null,
    };
  }

  public size(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0 && !this.processing;
  }
}
