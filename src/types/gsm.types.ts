import { QueueStatus } from "./queue.types";

export interface PendingCommand {
  command: string;
  expectedResponse: string | null;
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

export interface GSMDiagnostics {
  pinStatus?: string;
  messageFormat?: number;
  networkRegistration?: {
    n?: number;
    stat?: number;
  };
  signalQuality?: {
    rssi?: number;
    ber?: number;
  };
  serviceCenterAddress?: string;
  lastUpdated?: Date;
}
