import { Gpio } from "onoff";
import { GSMStatus } from "./gsm.types";

export interface TriggerInfo {
  gpio: Gpio;
  pin: number;
  name: string;
}

export interface TriggerStatus {
  key: string;
  name: string;
  pin: number;
}

export interface SystemStatus {
  running: boolean;
  inCooldown: boolean;
  triggers: TriggerStatus[];
  gsm: GSMStatus;
}
