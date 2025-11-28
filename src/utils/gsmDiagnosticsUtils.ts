import { GSMDiagnostics } from "../types";

/**
 * Converts PIN status to human-readable description
 */
export function getPinStatusDescription(pinStatus: string): string {
  const statusMap: Record<string, string> = {
    READY: "SIM card ready",
    "SIM PIN": "SIM PIN required",
    "SIM PUK": "SIM PUK required (PIN locked)",
    "SIM PIN2": "SIM PIN2 required",
    "SIM PUK2": "SIM PUK2 required",
    PH_SIM_PIN: "Phone-to-SIM card password required",
    PH_SIM_PUK: "Phone-to-SIM card unblocking password required",
    SIM_PIN: "SIM PIN required",
    SIM_PUK: "SIM PUK required",
  };
  return statusMap[pinStatus] || pinStatus;
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
  return match ? parseInt(match[1], 10) : undefined;
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
 * Converts network registration status to human-readable description
 */
export function getNetworkStatusDescription(stat: number): string {
  const statusMap: Record<number, string> = {
    0: "Not registered, not searching",
    1: "Registered (home network)",
    2: "Not registered, searching",
    3: "Registration denied",
    4: "Unknown",
    5: "Registered (roaming)",
  };
  return statusMap[stat] || `Unknown status (${stat})`;
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
    return {
      n: parseInt(match[1], 10),
      stat: parseInt(match[2], 10),
    };
  }
  return undefined;
}

/**
 * Converts RSSI value to dBm
 */
export function rssiToDbm(rssi: number): string {
  if (rssi === 99) return "Unknown or not detectable";
  if (rssi === 0) return "-113 dBm or less";
  if (rssi === 31) return "-51 dBm or greater";
  const dbm = -113 + rssi * 2;
  return `${dbm} dBm`;
}

/**
 * Converts RSSI to signal strength description
 */
export function getSignalStrengthDescription(rssi: number): string {
  if (rssi === 99) return "Unknown";
  if (rssi >= 20) return "Excellent";
  if (rssi >= 15) return "Good";
  if (rssi >= 10) return "Fair";
  if (rssi >= 5) return "Poor";
  return "Very Poor";
}

/**
 * Converts BER to signal quality description
 */
export function getSignalQualityDescription(ber: number): string {
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
 * Parses AT+CSQ response
 * Format: +CSQ: <rssi>,<ber>
 * Example: +CSQ: 20,0
 */
export function parseCSQ(
  response: string
): { rssi?: number; ber?: number } | undefined {
  const match = response.match(/\+CSQ:\s*(\d+),(\d+)/i);
  if (match) {
    return {
      rssi: parseInt(match[1], 10),
      ber: parseInt(match[2], 10),
    };
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
    return {
      operator: match[1].trim(),
      act: parseInt(match[2], 10),
    };
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
    return {
      operator: match3[1].trim(),
      act: match3[2] ? parseInt(match3[2], 10) : undefined,
    };
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

export function getDetailedStatusReport(diagnostics: GSMDiagnostics): string {
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

  // Last Updated
  if (diag.lastUpdated) {
    lines.push(`Last Updated: ${diag.lastUpdated.toLocaleString()}`);
  }

  lines.push("=====================================");

  return lines.join("\n");
}

export function getCompactStatusReport(
  diagnostics: GSMDiagnostics,
  phoneNumbers: string[] = [],
  sensorStates: boolean[] = []
): string {
  const diag = diagnostics;
  const parts: string[] = [];

  // Phone Numbers
  if (phoneNumbers.length > 0) {
    parts.push(`Phones: ${phoneNumbers.join(", ")}`);
  }

  // Sensor States (binary format: 0 = inactive, 1 = active)
  if (sensorStates.length > 0) {
    const binaryPattern = sensorStates
      .map((active) => (active ? "1" : "0"))
      .join("");
    parts.push(`Inputs: ${binaryPattern}`);
  }

  // PIN Status
  if (diag.pinStatusDescription) {
    parts.push(`SIM: ${diag.pinStatusDescription}`);
  }

  // Network Status
  if (diag.networkStatusDescription) {
    parts.push(`Network: ${diag.networkStatusDescription}`);
  }

  // Current Operator
  if (diag.currentOperator) {
    let operatorPart = `Operator: ${diag.currentOperator}`;
    if (diag.accessTechnologyDescription) {
      operatorPart += ` (${diag.accessTechnologyDescription})`;
    }
    parts.push(operatorPart);
  }

  // Signal Strength
  if (diag.signalStrengthDescription) {
    const signalText = diag.signalStrengthDescription;
    let signalPart = `Signal: ${signalText}`;
    if (diag.rssiValue) {
      signalPart += ` (${diag.rssiValue})`;
    }
    parts.push(signalPart);
  }

  // BER (Bit Error Rate)
  if (diag.signalQualityDescription) {
    parts.push(`BER: ${diag.signalQualityDescription}`);
  }

  return parts.join("; ");
}
