const { SerialPort } = require("serialport");

console.log("Scanning for available serial ports...\n");

SerialPort.list()
  .then((ports) => {
    if (ports.length === 0) {
      console.log("No serial ports found.");
      return;
    }

    console.log(`Found ${ports.length} serial port(s):\n`);

    ports.forEach((port, index) => {
      console.log(`${index + 1}. ${port.path}`);
      if (port.manufacturer) console.log(`   Manufacturer: ${port.manufacturer}`);
      if (port.serialNumber) console.log(`   Serial Number: ${port.serialNumber}`);
      if (port.pnpId) console.log(`   PnP ID: ${port.pnpId}`);
      if (port.vendorId) console.log(`   Vendor ID: ${port.vendorId}`);
      if (port.productId) console.log(`   Product ID: ${port.productId}`);
      console.log("");
    });

    console.log("Update your .env file with the correct SERIAL_PORT value.");
  })
  .catch((err) => {
    console.error("Error listing serial ports:", err.message);
    process.exit(1);
  });

