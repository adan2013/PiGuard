import { GSMDiagnostics } from "../types";
import { Config } from "../Config";

/**
 * Converts PIN status to short description
 */
export function getPinStatusDescription(pinStatus: string): string {
  const statusMap: Record<string, string> = {
    READY: "OK",
    "SIM PIN": "PIN",
    "SIM PUK": "PUK",
    "SIM PIN2": "PIN2",
    "SIM PUK2": "PUK2",
    PH_SIM_PIN: "PIN",
    PH_SIM_PUK: "PUK",
    SIM_PIN: "PIN",
    SIM_PUK: "PUK",
  };
  return statusMap[pinStatus] || "?";
}

/**
 * Parses AT+CPIN? response
 * Format: +CPIN: <code>
 * Example: +CPIN: READY
 */
export function parseCPIN(response: string): string | undefined {
  const match = response.match(/\+CPIN:\s*(.+)/i);
  return match ? match[1].trim() : undefined;
}

/**
 * Converts message format mode to human-readable description
 */
export function getMessageFormatDescription(mode: number): string {
  return mode === 0
    ? "PDU mode"
    : mode === 1
    ? "Text mode"
    : `Unknown mode (${mode})`;
}

/**
 * Parses AT+CMGF? response
 * Format: +CMGF: <mode>
 * Example: +CMGF: 1
 */
export function parseCMGF(response: string): number | undefined {
  const match = response.match(/\+CMGF:\s*(\d+)/i);
  if (match) {
    const mode = parseInt(match[1], 10);
    return isValidMessageFormat(mode) ? mode : undefined;
  }
  return undefined;
}

/**
 * Converts network registration notification mode to description
 */
export function getNetworkRegistrationModeDescription(n: number): string {
  const modeMap: Record<number, string> = {
    0: "Notifications disabled",
    1: "Notifications enabled",
    2: "Notifications with location info enabled",
  };
  return modeMap[n] || `Unknown mode (${n})`;
}

/**
 * Converts network registration status to short description
 */
export function getNetworkStatusDescription(stat: number): string {
  if (!isValidNetworkStatus(stat)) {
    return "INV";
  }
  const statusMap: Record<number, string> = {
    0: "NO",
    1: "HOME",
    2: "SEARCH",
    3: "DENIED",
    4: "UNK",
    5: "ROAM",
  };
  return statusMap[stat] || "?";
}

/**
 * Parses AT+CREG? response
 * Format: +CREG: <n>,<stat>
 * Example: +CREG: 0,1
 */
export function parseCREG(
  response: string
): { n?: number; stat?: number } | undefined {
  const match = response.match(/\+CREG:\s*(\d+),(\d+)/i);
  if (match) {
    const n = parseInt(match[1], 10);
    const stat = parseInt(match[2], 10);

    const result: { n?: number; stat?: number } = {};

    // n should be 0, 1, or 2
    if (n >= 0 && n <= 2) {
      result.n = n;
    }

    if (isValidNetworkStatus(stat)) {
      result.stat = stat;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }
  return undefined;
}

/**
 * Converts RSSI value to dBm
 */
export function rssiToDbm(rssi: number): string {
  if (!isValidRSSI(rssi)) {
    return "Invalid RSSI";
  }
  if (rssi === 99) return "Unknown or not detectable";
  if (rssi === 0) return "-113 dBm or less";
  if (rssi === 31) return "-51 dBm or greater";
  const dbm = -113 + rssi * 2;
  return `${dbm} dBm`;
}

/**
 * Converts RSSI to short signal strength description
 */
export function getSignalStrengthDescription(rssi: number): string {
  if (!isValidRSSI(rssi)) {
    return "INV";
  }
  if (rssi === 99) return "UNK";
  if (rssi >= 20) return "EXC";
  if (rssi >= 15) return "GOOD";
  if (rssi >= 10) return "FAIR";
  if (rssi >= 5) return "POOR";
  return "VPOOR";
}

/**
 * Converts BER to signal quality description
 */
export function getSignalQualityDescription(ber: number): string {
  if (!isValidBER(ber)) {
    return "Invalid BER";
  }
  if (ber === 99) return "Unknown";
  const qualityMap: Record<number, string> = {
    0: "Excellent (< 0.2%)",
    1: "Good (0.2% - 0.4%)",
    2: "Fair (0.4% - 0.8%)",
    3: "Poor (0.8% - 1.6%)",
    4: "Very Poor (1.6% - 3.2%)",
    5: "Bad (3.2% - 6.4%)",
    6: "Very Bad (6.4% - 12.8%)",
    7: "Extremely Bad (> 12.8%)",
  };
  return qualityMap[ber] || `Unknown (${ber})`;
}

/**
 * Validates RSSI value (0-31 or 99)
 */
export function isValidRSSI(rssi: number): boolean {
  return (rssi >= 0 && rssi <= 31) || rssi === 99;
}

/**
 * Validates BER value (0-7 or 99)
 */
export function isValidBER(ber: number): boolean {
  return (ber >= 0 && ber <= 7) || ber === 99;
}

/**
 * Validates network registration status (0-5)
 */
export function isValidNetworkStatus(stat: number): boolean {
  return stat >= 0 && stat <= 5;
}

/**
 * Validates access technology (0-7)
 */
export function isValidAccessTechnology(act: number): boolean {
  return act >= 0 && act <= 7;
}

/**
 * Validates message format (0 or 1)
 */
export function isValidMessageFormat(mode: number): boolean {
  return mode === 0 || mode === 1;
}

/**
 * Parses AT+CSQ response
 * Format: +CSQ: <rssi>,<ber>
 * Example: +CSQ: 20,0
 */
export function parseCSQ(
  response: string
): { rssi?: number; ber?: number } | undefined {
  const match = response.match(/\+CSQ:\s*(\d+),(\d+)/i);
  if (match) {
    const rssi = parseInt(match[1], 10);
    const ber = parseInt(match[2], 10);

    const result: { rssi?: number; ber?: number } = {};

    if (isValidRSSI(rssi)) {
      result.rssi = rssi;
    }

    if (isValidBER(ber)) {
      result.ber = ber;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }
  return undefined;
}

/**
 * Parses AT+CSCA? response
 * Format: +CSCA: "<sca>"
 * Example: +CSCA: "+1234567890"
 */
export function parseCSCA(response: string): string | undefined {
  const match = response.match(/\+CSCA:\s*"([^"]+)"/i);
  return match ? match[1].trim() : undefined;
}

/**
 * Converts Access Technology (AcT) to short description
 */
export function getAccessTechnologyDescription(act: number): string {
  if (!isValidAccessTechnology(act)) {
    return "INV";
  }
  const actMap: Record<number, string> = {
    0: "2G",
    1: "2G",
    2: "3G",
    3: "2G",
    4: "3.5G",
    5: "3.5G",
    6: "3.5G",
    7: "4G",
  };
  return actMap[act] || `${act}`;
}

/**
 * Parses AT+COPS? response
 * Format: +COPS: <mode>[,<format>[,<oper>[,<act>]]]
 * Example: +COPS: 0,0,"T-Mobile",7
 */
export function parseCOPS(
  response: string
): { operator?: string; act?: number } | undefined {
  // Try with operator name in quotes and AcT
  const match = response.match(/\+COPS:\s*\d+,\d+,"([^"]+)",(\d+)/i);
  if (match) {
    const act = parseInt(match[2], 10);
    const result: { operator?: string; act?: number } = {
      operator: match[1].trim(),
    };
    if (isValidAccessTechnology(act)) {
      result.act = act;
    }
    return result;
  }
  // Try with operator name in quotes without AcT
  const match2 = response.match(/\+COPS:\s*\d+,\d+,"([^"]+)"/i);
  if (match2) {
    return {
      operator: match2[1].trim(),
    };
  }
  // Try without quotes (numeric operator)
  const match3 = response.match(/\+COPS:\s*\d+,\d+,(\d+)(?:,(\d+))?/i);
  if (match3) {
    const result: { operator?: string; act?: number } = {
      operator: match3[1].trim(),
    };
    if (match3[2]) {
      const act = parseInt(match3[2], 10);
      if (isValidAccessTechnology(act)) {
        result.act = act;
      }
    }
    return result;
  }
  return undefined;
}

/**
 * Extracts diagnostic data from AT command response
 */
export function extractDiagnosticsFromResponse(
  command: string,
  response: string
): Partial<GSMDiagnostics> {
  const diagnostics: Partial<GSMDiagnostics> = {};

  if (command.includes("+CPIN?")) {
    const pinStatus = parseCPIN(response);
    if (pinStatus) {
      diagnostics.pinStatus = pinStatus;
      diagnostics.pinStatusDescription = getPinStatusDescription(pinStatus);
    }
  } else if (command.includes("+CMGF?")) {
    const messageFormat = parseCMGF(response);
    if (messageFormat !== undefined) {
      diagnostics.messageFormat = messageFormat;
      diagnostics.messageFormatDescription =
        getMessageFormatDescription(messageFormat);
    }
  } else if (command.includes("+CREG?")) {
    const networkReg = parseCREG(response);
    if (networkReg) {
      diagnostics.networkRegistration = networkReg;
      if (networkReg.n !== undefined) {
        diagnostics.networkRegistrationDescription =
          getNetworkRegistrationModeDescription(networkReg.n);
      }
      if (networkReg.stat !== undefined) {
        diagnostics.networkStatusDescription = getNetworkStatusDescription(
          networkReg.stat
        );
      }
    }
  } else if (command.includes("+CSQ")) {
    const signalQuality = parseCSQ(response);
    if (signalQuality) {
      diagnostics.signalQuality = signalQuality;
      if (signalQuality.rssi !== undefined) {
        diagnostics.rssiValue = rssiToDbm(signalQuality.rssi);
        diagnostics.signalStrengthDescription = getSignalStrengthDescription(
          signalQuality.rssi
        );
      }
      if (signalQuality.ber !== undefined) {
        diagnostics.signalQualityDescription = getSignalQualityDescription(
          signalQuality.ber
        );
      }
    }
  } else if (command.includes("+CSCA?")) {
    const sca = parseCSCA(response);
    if (sca) diagnostics.serviceCenterAddress = sca;
  } else if (command.includes("+COPS?")) {
    const copsData = parseCOPS(response);
    if (copsData) {
      if (copsData.operator) {
        diagnostics.currentOperator = copsData.operator;
      }
      if (copsData.act !== undefined) {
        diagnostics.accessTechnology = copsData.act;
        diagnostics.accessTechnologyDescription =
          getAccessTechnologyDescription(copsData.act);
      }
    }
  }

  return diagnostics;
}

export function getDetailedStatusReport(
  diagnostics: GSMDiagnostics,
  config: Config
): string {
  const diag = diagnostics;
  const lines: string[] = [];

  lines.push("=== GSM Module Diagnostic Report ===");
  lines.push("");

  // PIN Status
  if (diag.pinStatusDescription) {
    lines.push(`PIN Status: ${diag.pinStatusDescription}`);
  } else if (diag.pinStatus) {
    lines.push(`PIN Status: ${diag.pinStatus}`);
  }

  // Message Format
  if (diag.messageFormatDescription) {
    lines.push(`Message Format: ${diag.messageFormatDescription}`);
  } else if (diag.messageFormat !== undefined) {
    lines.push(`Message Format: Mode ${diag.messageFormat}`);
  }

  // Network Registration
  if (diag.networkStatusDescription) {
    lines.push(`Network Status: ${diag.networkStatusDescription}`);
    if (diag.networkRegistrationDescription) {
      lines.push(`  ${diag.networkRegistrationDescription}`);
    }
  } else if (diag.networkRegistration) {
    lines.push("Network Status: Unknown");
  }

  // Current Operator
  if (diag.currentOperator) {
    let operatorLine = `Current Operator: ${diag.currentOperator}`;
    if (diag.accessTechnologyDescription) {
      operatorLine += ` (${diag.accessTechnologyDescription})`;
    }
    lines.push(operatorLine);
  }

  // Signal Quality
  if (diag.signalStrengthDescription || diag.signalQualityDescription) {
    lines.push("Signal Quality:");
    if (diag.rssiValue) {
      lines.push(
        `  Signal Strength: ${diag.signalStrengthDescription} (${diag.rssiValue})`
      );
    } else if (diag.signalStrengthDescription) {
      lines.push(`  Signal Strength: ${diag.signalStrengthDescription}`);
    }
    if (diag.signalQualityDescription) {
      lines.push(`  Bit Error Rate: ${diag.signalQualityDescription}`);
    }
  } else if (diag.signalQuality) {
    lines.push("Signal Quality: Unknown");
  }

  // Service Center Address
  if (diag.serviceCenterAddress) {
    lines.push(`Service Center Address: ${diag.serviceCenterAddress}`);
  }

  // Uptime
  const uptime = config.getUptimeValue();
  lines.push(`Uptime: ${uptime.days}d ${uptime.hours}h`);

  lines.push("=====================================");

  return lines.join("\n");
}

export function getCompactStatusReport(
  diagnostics: GSMDiagnostics,
  config: Config,
  inputStates: boolean[] = []
): string {
  const diag = diagnostics;
  const parts: string[] = [];

  // PIN Status
  if (diag.pinStatusDescription) {
    parts.push(`SIM:${diag.pinStatusDescription}`);
  }

  // Network Status
  if (diag.networkStatusDescription) {
    parts.push(`NET:${diag.networkStatusDescription}`);
  }

  // Current Operator (shortened)
  if (diag.currentOperator) {
    const opShort =
      diag.currentOperator.length > 8
        ? diag.currentOperator.substring(0, 8)
        : diag.currentOperator;
    let operatorPart = `OP:${opShort}`;
    if (diag.accessTechnologyDescription) {
      operatorPart += ` (${diag.accessTechnologyDescription})`;
    }
    parts.push(operatorPart);
  }

  // Signal Strength
  if (diag.signalStrengthDescription) {
    parts.push(`SIG:${diag.signalStrengthDescription}`);
  }

  // Phone Numbers
  if (config.phoneNumbers.length > 0) {
    parts.push(`PH:${config.phoneNumbers.length}`);
  }

  // Uptime
  const uptime = config.getUptimeValue();
  parts.push(`UPT:${uptime.days}d${uptime.hours}h`);

  // Input States
  if (inputStates.length > 0) {
    const states = inputStates.map((state) => (state ? "1" : "0")).join("");
    parts.push(`IN:${states}`);
  }

  return parts.join("; ");
}
