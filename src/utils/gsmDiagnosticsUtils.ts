import { GSMDiagnostics } from "../types";

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
 * Parses AT+CMGF? response
 * Format: +CMGF: <mode>
 * Example: +CMGF: 1
 */
export function parseCMGF(response: string): number | undefined {
  const match = response.match(/\+CMGF:\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
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
 * Extracts diagnostic data from AT command response
 */
export function extractDiagnosticsFromResponse(
  command: string,
  response: string
): Partial<GSMDiagnostics> {
  const diagnostics: Partial<GSMDiagnostics> = {};

  if (command.includes("+CPIN?")) {
    const pinStatus = parseCPIN(response);
    if (pinStatus) diagnostics.pinStatus = pinStatus;
  } else if (command.includes("+CMGF?")) {
    const messageFormat = parseCMGF(response);
    if (messageFormat !== undefined) diagnostics.messageFormat = messageFormat;
  } else if (command.includes("+CREG?")) {
    const networkReg = parseCREG(response);
    if (networkReg) diagnostics.networkRegistration = networkReg;
  } else if (command.includes("+CSQ")) {
    const signalQuality = parseCSQ(response);
    if (signalQuality) diagnostics.signalQuality = signalQuality;
  } else if (command.includes("+CSCA?")) {
    const sca = parseCSCA(response);
    if (sca) diagnostics.serviceCenterAddress = sca;
  }

  return diagnostics;
}
