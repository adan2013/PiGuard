import { QueueStatus } from "./queue.types";

export interface PendingCommand {
  command: string;
  expectedResponse: string;
  timeoutHandle: NodeJS.Timeout;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

export interface SMSResult {
  phoneNumber: string;
  success: boolean;
  error?: string;
}

export interface GSMStatus {
  isReady: boolean;
  portOpen: boolean;
  queueStatus: QueueStatus;
}

