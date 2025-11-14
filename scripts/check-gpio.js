#!/usr/bin/env node

const { Gpio } = require("onoff");

console.log("=== GPIO Diagnostic Tool ===\n");

console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}`);
console.log(`User: ${process.env.USER || process.env.USERNAME || "unknown"}\n`);

if (process.platform !== "linux") {
  console.error("❌ GPIO is only available on Linux (Raspberry Pi)");
  process.exit(1);
}

async function checkGPIO() {
  let gpioAccessOK = false;

  try {
    console.log("1. Checking GPIO module access...");
    const testPin = 18;
    const gpio = new Gpio(testPin, "in", "none");
    gpio.unexport();
    console.log("   ✓ GPIO module accessible\n");
    gpioAccessOK = true;
  } catch (error) {
    console.error(`   ❌ GPIO access failed: ${error.message}`);
    if (error.code === "EINVAL" || error.errno === "EINVAL") {
      console.error("   This usually indicates permission issues.\n");
    }
  }

  console.log("2. Checking permissions...");
  const { exec } = require("child_process");

  exec("groups", (error, stdout) => {
    if (error) {
      console.log("   ⚠ Could not check groups");
    } else {
      const groups = stdout.trim().split(" ");
      if (groups.includes("gpio")) {
        console.log("   ✓ User is in gpio group");
      } else {
        console.log("   ❌ User is NOT in gpio group");
        console.log("   Fix: sudo usermod -a -G gpio $USER && sudo reboot");
      }
    }
    console.log("");

    exec("ls -l /dev/gpiochip* 2>/dev/null", (error, stdout) => {
      if (error) {
        console.log("3. ⚠ Could not check /dev/gpiochip* devices");
        console.log("   This might indicate GPIO support is not available\n");
      } else {
        console.log("3. GPIO devices found:");
        console.log(stdout);
      }

      exec("ls -la /sys/class/gpio/ 2>/dev/null", (error2, stdout2) => {
        if (!error2) {
          console.log("4. Legacy sysfs GPIO interface:");
          console.log(stdout2);
          console.log("");
        }

        exec(
          "test -w /sys/class/gpio/export && echo 'writable' || echo 'NOT writable'",
          (error3, stdout3) => {
            const isWritable = stdout3.trim() === "writable";
            console.log("5. /sys/class/gpio/export permissions:");
            if (isWritable) {
              console.log("   ✓ export file is writable");
            } else {
              console.log(
                "   ❌ export file is NOT writable (permission denied)"
              );
              console.log(
                "   This is likely the root cause of the EINVAL error!"
              );
              console.log("\n   Quick fix:");
              console.log(
                "   sudo chmod 666 /sys/class/gpio/export /sys/class/gpio/unexport"
              );
              console.log("\n   Permanent fix:");
              console.log("   sudo usermod -a -G gpio $USER && sudo reboot");
            }
            console.log("");

            exec(
              "ls -l /sys/class/gpio/export 2>/dev/null",
              (error4, stdout4) => {
                if (!error4) {
                  console.log("6. Current export file permissions:");
                  console.log(stdout4);
                  console.log("");
                }

                if (!gpioAccessOK && !isWritable) {
                  console.log("⚠️  SUMMARY:");
                  console.log(
                    "   GPIO access failed due to permission issues."
                  );
                  console.log(
                    "   The export file is not writable by your user."
                  );
                  console.log("\n   SOLUTION:");
                  console.log("   Run these commands:");
                  console.log("   sudo usermod -a -G gpio $USER");
                  console.log("   sudo reboot");
                  console.log(
                    "\n   After reboot, run this diagnostic again.\n"
                  );
                }

                testSpecificPin();
              }
            );
          }
        );
      });
    });
  });
}

function testSpecificPin() {
  const pin = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  if (!pin) {
    console.log("7. To test a specific GPIO pin, run:");
    console.log("   node scripts/check-gpio.js <pin_number>");
    console.log("   Example: node scripts/check-gpio.js 21");
    return;
  }

  console.log(`7. Testing GPIO pin ${pin}...`);
  
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);
  
  exec(`ls /sys/class/gpio/ | grep "^gpio${pin}$"`, async (error, stdout) => {
    const alreadyExported = !error && stdout.trim() === `gpio${pin}`;
    
    if (alreadyExported) {
      console.log(`   ⚠ GPIO ${pin} is already exported`);
      try {
        await execAsync(`echo ${pin} | sudo tee /sys/class/gpio/unexport`);
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(`   ✓ Unexported GPIO ${pin}, will retry\n`);
      } catch (e) {
        console.log(`   ⚠ Could not unexport: ${e.message}\n`);
      }
    }

    console.log(`8. Attempting manual export of GPIO ${pin}...`);
    try {
      const { stdout, stderr } = await execAsync(`echo ${pin} | tee /sys/class/gpio/export`);
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log(`   ✓ Manual export successful`);
      
      exec(`cat /sys/class/gpio/gpio${pin}/direction 2>/dev/null`, (error, stdout) => {
        if (!error) {
          console.log(`   ✓ Pin direction: ${stdout.trim()}`);
        }
      });
      
      exec(`cat /sys/class/gpio/gpio${pin}/value 2>/dev/null`, (error, stdout) => {
        if (!error) {
          console.log(`   ✓ Pin value: ${stdout.trim()}`);
        }
        console.log("");
        testWithLibrary();
      });
    } catch (error) {
      console.error(`   ❌ Manual export failed: ${error.message}`);
      if (error.stderr) console.error(`   Error: ${error.stderr}`);
      console.log("");
      console.log(`   This suggests GPIO ${pin} may not be available on this system.`);
      console.log(`   Possible reasons:`);
      console.log(`   - Pin ${pin} is reserved by the system`);
      console.log(`   - Pin ${pin} doesn't exist on this Raspberry Pi model`);
      console.log(`   - Pin ${pin} is already in use by another driver`);
      console.log(`\n   Try a different GPIO pin in your .env file (e.g., GPIO 2, 3, 4, 5, 6, 12, 13, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27)\n`);
      testWithLibrary();
    }
  });

  function testWithLibrary() {
    let gpio = null;

    try {
      console.log(`9. Testing with onoff library...`);
      gpio = new Gpio(pin, "in", "both", {
        debounceTimeout: 10,
      });

      const value = gpio.readSync();
      console.log(`   ✓ GPIO ${pin} configured successfully with onoff library`);
      console.log(`   ✓ Current value: ${value}`);
      console.log(`   ✓ Pin is ready for monitoring`);

      gpio.unexport();
      console.log(`   ✓ Pin ${pin} unexported successfully\n`);
      console.log(`✅ GPIO ${pin} is working correctly!\n`);
    } catch (error) {
    console.error(`   ❌ Failed to configure GPIO ${pin}: ${error.message}`);

    if (error.code === "EINVAL" || error.errno === "EINVAL") {
      console.error(`\n   EINVAL error on GPIO ${pin}:`);
      console.error(
        `   - Check if pin ${pin} exists on your Raspberry Pi model`
      );
      console.error(
        `   - Verify pin is not already in use: ls /sys/class/gpio/`
      );
      console.error(
        `   - Check export file permissions: ls -l /sys/class/gpio/export`
      );
      console.error(
        `   - Ensure GPIO kernel module is loaded: lsmod | grep gpio`
      );
      console.error(
        `   - Try manually: echo ${pin} | sudo tee /sys/class/gpio/export`
      );
      console.error(`\n   Common fix:`);
      console.error(
        `   sudo chmod 666 /sys/class/gpio/export /sys/class/gpio/unexport`
      );
      console.error(
        `   Or add user to gpio group: sudo usermod -a -G gpio $USER && sudo reboot`
      );
    } else if (error.code === "EPERM" || error.errno === "EPERM") {
      console.error(`\n   Permission denied on GPIO ${pin}:`);
      console.error(`   Run: sudo usermod -a -G gpio $USER && sudo reboot`);
    } else if (error.code === "EBUSY" || error.errno === "EBUSY") {
      console.error(`\n   GPIO ${pin} is busy (already in use):`);
      console.error(`   Try: echo ${pin} | sudo tee /sys/class/gpio/unexport`);
    }

    if (gpio) {
      try {
        gpio.unexport();
      } catch (e) {}
    }
    process.exit(1);
  }
}

checkGPIO();
