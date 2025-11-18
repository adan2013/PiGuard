const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const prompts = require("prompts");

let port = null;
let parser = null;
let responseBuffer = "";
let isWaitingForResponse = false;
let responseResolve = null;
let responseTimeout = null;

async function listPorts() {
  try {
    const ports = await SerialPort.list();
    return ports;
  } catch (err) {
    console.error("Error listing serial ports:", err.message);
    throw err;
  }
}

function openPort(portPath, baudRate = 9600) {
  return new Promise((resolve, reject) => {
    port = new SerialPort({
      path: portPath,
      baudRate: baudRate,
      autoOpen: false,
    });

    parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    parser.on("data", (data) => {
      const trimmedData = data.trim();
      if (!trimmedData) return;

      console.log(`<< ${trimmedData}`);

      if (isWaitingForResponse && responseResolve) {
        responseBuffer += trimmedData + "\n";

        // Check for common responses
        if (
          trimmedData.includes("OK") ||
          trimmedData.includes("ERROR") ||
          trimmedData.includes("FAIL")
        ) {
          clearTimeout(responseTimeout);
          const response = responseBuffer.trim();
          responseBuffer = "";
          isWaitingForResponse = false;
          const resolveFn = responseResolve;
          responseResolve = null;
          resolveFn(response);
        }
      }
    });

    port.open((err) => {
      if (err) {
        reject(new Error(`Failed to open serial port: ${err.message}`));
      } else {
        console.log(`\n✓ Serial port ${portPath} opened successfully\n`);
        resolve();
      }
    });
  });
}

function sendCommand(command, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (!port || !port.isOpen) {
      reject(new Error("Serial port not open"));
      return;
    }

    responseBuffer = "";
    isWaitingForResponse = true;

    responseTimeout = setTimeout(() => {
      isWaitingForResponse = false;
      responseResolve = null;
      reject(new Error(`Command timeout: ${command}`));
    }, timeout);

    responseResolve = resolve;

    console.log(`>> ${command}`);
    port.write(command + "\r\n", (err) => {
      if (err) {
        clearTimeout(responseTimeout);
        isWaitingForResponse = false;
        responseResolve = null;
        reject(new Error(`Failed to write command: ${err.message}`));
      }
    });
  });
}

function closePort() {
  return new Promise((resolve) => {
    if (port && port.isOpen) {
      port.close((err) => {
        if (err) {
          console.error("Error closing port:", err.message);
        } else {
          console.log("\n✓ Serial port closed");
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function main() {
  console.log("AT Command Terminal\n");
  console.log("Scanning for available serial ports...\n");

  try {
    const ports = await listPorts();

    if (ports.length === 0) {
      console.log("No serial ports found.");
      process.exit(1);
    }

    // Ask user to select a port
    const portChoices = ports.map((p) => ({
      title: `${p.path}${p.manufacturer ? ` (${p.manufacturer})` : ""}`,
      value: p.path,
      description: p.serialNumber
        ? `Serial: ${p.serialNumber}`
        : p.vendorId
        ? `Vendor: ${p.vendorId}, Product: ${p.productId}`
        : "",
    }));

    const portResponse = await prompts({
      type: "select",
      name: "port",
      message: "Select a serial port:",
      choices: portChoices,
    });

    if (!portResponse.port) {
      console.log("No port selected. Exiting.");
      process.exit(0);
    }

    // Ask for baud rate
    const baudRateResponse = await prompts({
      type: "number",
      name: "baudRate",
      message: "Enter baud rate (default: 9600):",
      initial: 9600,
    });

    const baudRate = baudRateResponse.baudRate || 9600;

    // Open the port
    await openPort(portResponse.port, baudRate);

    // Wait a bit for the port to stabilize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Main command loop
    while (true) {
      const commandResponse = await prompts({
        type: "text",
        name: "command",
        message: "Enter AT command (or 'exit' to quit):",
      });

      if (!commandResponse.command) {
        continue;
      }

      const command = commandResponse.command.trim();

      if (
        command.toLowerCase() === "exit" ||
        command.toLowerCase() === "quit"
      ) {
        break;
      }

      if (command.length === 0) {
        continue;
      }

      try {
        await sendCommand(command);
      } catch (error) {}
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await closePort();
    process.exit(0);
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", async () => {
  console.log("\n\nExiting...");
  await closePort();
  process.exit(0);
});

main();
