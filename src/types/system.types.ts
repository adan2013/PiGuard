import { Line } from "node-libgpiod";
import { GSMStatus } from "./gsm.types";

export interface TriggerInfo {
  gpio: Line;
  pin: number;
  name: string;
  lastValue: number;
}

export interface TriggerStatus {
  key: string;
  name: string;
  pin: number;
  cooldown: boolean;
}

export interface SystemStatus {
  running: boolean;
  triggers: TriggerStatus[];
  gsm: GSMStatus;
}
