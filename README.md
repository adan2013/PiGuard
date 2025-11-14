# PiGuard 🛡️

TypeScript-based surveillance system for Raspberry Pi with GSM module support.

## Features

- Monitor up to 3 GPIO input pins
- SMS alerts via GSM module
- AT command queue with retry logic
- Configurable via environment variables
- Comprehensive logging
- Cooldown protection against alert spam

## Hardware Requirements

- Raspberry Pi with GPIO pins
- GSM module (SIM800L, SIM900, SIM7600)
- Active SIM card with SMS capability
- GPIO sensors (door sensors, motion detectors)

## Installation

```bash
npm install
npm run list-ports  # Find your serial port
cp env.example .env
nano .env
```

## Configuration

Edit `.env` file:

```env
# Serial Port
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUDRATE=9600

# GPIO Pins (BCM numbering)
GPIO_TRIGGER_1=17
GPIO_TRIGGER_2=27
GPIO_TRIGGER_3=22

# Trigger Names
TRIGGER_1_NAME=Front Door
TRIGGER_2_NAME=Back Door
TRIGGER_3_NAME=Window

# Phone Numbers (comma-separated with country code)
PHONE_NUMBERS=+1234567890,+0987654321

# GSM Settings
AT_COMMAND_TIMEOUT=5000
AT_COMMAND_RETRY=3
```

## Hardware Setup

### GSM Module Connection

| GSM Module | Raspberry Pi |
| ---------- | ------------ |
| VCC        | 5V           |
| GND        | GND          |
| TX         | RX (GPIO 15) |
| RX         | TX (GPIO 14) |

⚠️ Some GSM modules require 3.3V logic level shifters for RX/TX pins.

## Usage

```bash
npm run build       # Compile TypeScript
npm start           # Build and run
npm run dev         # Development mode
npm run watch       # Watch mode
npm run list-ports  # List available serial ports
```

## Run as Service

Create `/etc/systemd/system/piguard.service`:

```ini
[Unit]
Description=PiGuard Surveillance System
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/PiGuard
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable piguard.service
sudo systemctl start piguard.service
sudo systemctl status piguard.service
```

View logs:

```bash
sudo journalctl -u piguard.service -f
```

## Project Structure

```
PiGuard/
├── src/
│   ├── types/             # TypeScript type definitions
│   │   ├── index.ts       # Type exports
│   │   ├── config.types.ts
│   │   ├── queue.types.ts
│   │   ├── gsm.types.ts
│   │   └── system.types.ts
│   ├── Config.ts          # Configuration management
│   ├── ATCommandQueue.ts  # AT command queue
│   ├── GSMModule.ts       # GSM communication
│   └── index.ts           # Main application
├── scripts/
│   └── list-ports.js      # Serial port scanner
├── dist/                  # Compiled output
├── package.json
├── tsconfig.json
└── .env                   # Configuration
```

## AT Commands

- `AT` - Test connection
- `ATE0` - Disable echo
- `AT+CMGF=1` - SMS text mode
- `AT+CNMI=1,2,0,0,0` - SMS notifications
- `AT+CMGS="<number>"` - Send SMS

## Troubleshooting

### Serial Port Permission

```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

### GSM Module Not Responding

- Check physical connections
- Run `npm run list-ports` to find available serial ports
- Verify serial port in `.env` file
- Test with: `minicom -D /dev/ttyUSB0 -b 9600`
- Ensure SIM card is inserted
- Check power supply

### GPIO Access

```bash
sudo usermod -a -G gpio $USER
sudo reboot
```

### No SMS Received

- Verify SIM has credit/active plan
- Check phone numbers include country code
- Verify network signal and registration
- Check logs for errors

## License

MIT
