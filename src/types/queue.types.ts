export interface CommandObject {
  command: string;
  expectedResponse: string | null;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  retries: number;
  timestamp: number;
}

export interface QueueStatus {
  queueSize: number;
  processing: boolean;
  currentCommand: string | null;
}

export type CommandExecutor = (commandObj: CommandObject) => Promise<string>;
