# PiGuard Python Implementation

Python version of the PiGuard surveillance system with similar functionality to the Node.js/TypeScript version.

## Features

- **GPIO Monitoring**: Monitors GPIO pins for trigger events (door/window sensors)
- **SMS Alerts**: Sends SMS alerts via GSM module using AT commands
- **Command Queue**: Manages AT commands with retry logic and queuing
- **Cooldown Period**: Prevents alert spam with configurable cooldown
- **Startup Notifications**: Sends notification when system starts

## Requirements

- Python 3.8+
- Raspberry Pi (for GPIO support)
- GSM module connected via serial port
- RPi.GPIO library (for GPIO on Raspberry Pi)

## Installation

1. Install Python dependencies:

```bash
pip install -r requirements.txt
```

Note: `RPi.GPIO` is only needed on Raspberry Pi. On other systems, GPIO functionality will be disabled.

## Configuration

Create a `.env` file in the project root (use `env.example` as a template):

```env
# Serial Port Configuration
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUDRATE=9600

# GPIO Pin Configuration (BCM numbering)
GPIO_TRIGGER_1=17
GPIO_TRIGGER_2=27
GPIO_TRIGGER_3=22

# Trigger Names
TRIGGER_1_NAME=Front Door
TRIGGER_2_NAME=Back Door
TRIGGER_3_NAME=Window

# Phone Numbers (comma-separated)
PHONE_NUMBERS=+1234567890,+0987654321

# GSM Module Settings
AT_COMMAND_TIMEOUT=5000
AT_COMMAND_RETRY=3
```

## Usage

Run the main script:

```bash
python main.py
```

Or make it executable and run directly:

```bash
chmod +x main.py
./main.py
```

## Project Structure

```
python/
├── __init__.py          # Package initialization
├── main.py              # Main entry point
├── piguard.py           # Main PiGuard class
├── config.py            # Configuration management
├── gsm_module.py        # GSM module communication
├── at_command_queue.py  # AT command queue with retries
├── requirements.txt     # Python dependencies
└── README.md           # This file
```

## Differences from Node.js Version

- Uses `asyncio` for asynchronous operations instead of Promises
- Uses `pyserial` instead of `serialport` for serial communication
- Uses `RPi.GPIO` instead of `onoff` for GPIO control
- Uses `python-dotenv` instead of `dotenv` for environment variables
- Event-driven GPIO handling uses callbacks with async task creation

## Signal Handling

The Python version handles:

- `SIGINT` (Ctrl+C)
- `SIGTERM` (termination signal)
- `KeyboardInterrupt` (Ctrl+C in Python)

All signals trigger a clean shutdown, closing GPIO pins and serial connections.

## Error Handling

- All AT commands are queued and retried on failure
- GPIO setup failures are logged but don't stop the system
- SMS sending failures are logged individually per phone number
- Uncaught exceptions trigger clean shutdown

## Notes

- GPIO functionality is only available on Linux systems (Raspberry Pi)
- On non-Linux systems, the system will run but GPIO triggers will be disabled
- The system uses BCM GPIO numbering (same as Node.js version)
- Cooldown period is 5 minutes by default (configurable in code)
