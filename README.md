# PiGuard 🛡️

TypeScript-based surveillance system for Raspberry Pi with GSM module support and web interface.

---

## 📋 Table of Contents

- [Status LED Meanings](#status-led-meanings)
- [Sound Alerts](#sound-alerts)
- [Front Panel Switches](#front-panel-switches)
- [Quick Start Guide](#quick-start-guide)
- [Configuration](#configuration)
- [Running the System](#running-the-system)
- [Web Control Panel](#web-control-panel)
- [Raspberry Pi Setup](#raspberry-pi-setup)

---

## 💡 Status LED Meanings

The status LED provides visual feedback about the system state:

| LED State      | Meaning         | Description                                                                  |
| -------------- | --------------- | ---------------------------------------------------------------------------- |
| **Off**        | System inactive | LED is turned off (typically during shutdown or initialization)              |
| **Slow Flash** | System idle     | Brief flash every 5 seconds - system is running normally, no active triggers |
| **Fast Blink** | ALERT ACTIVE    | Rapid blinking every 200ms - one or more triggers have been activated        |
| **Solid On**   | Alerts disabled | LED stays on continuously - SMS alerts are disabled, by the key              |

**Note:** The LED can be disabled via configuration (`DISABLE_LED=1` in `.env` file).

---

## 🔊 Sound Alerts

The system uses different sound patterns to communicate various events:

| Sound           | When It Plays   | Description                                                |
| --------------- | --------------- | ---------------------------------------------------------- |
| **Single Beep** | Switch actions  | Confirms various actions                                   |
| **Long Beep**   | System startup  | 1-second beep when system starts                           |
| **Melody Up**   | TRIGGER ALERT   | Ascending 5-note melody when a sensor trigger is activated |
| **Melody Down** | System shutdown | Descending 5-note melody before system shutdown            |

**Note:** Sounds can be disabled via configuration (`DISABLE_SOUND=1` in `.env` file).

---

## 🔑 Front Panel Key Switch

The system uses a car ignition key switch for manual control. The switch has two positions:

### SW1 - Ignition Position (Key Turned to "ON")

When the key is turned to the ignition position:

- **Disables SMS alerts**
  - LED turns **Solid On** to indicate alerts are disabled
  - Plays a single beep
  - Useful when you're testing or want to temporarily disable alerts

When the key is turned back (released from ignition position):

- **Re-enables SMS alerts**
  - LED returns to normal state (Slow Flash or Fast Blink)
  - Plays a single beep
  - System resumes normal monitoring

### SW2 - Starter Position (Key Turned to "START")

When the key is turned to the starter position:

- **Brief Turn** (< 2 seconds): Sends diagnostic SMS

  - Plays a single beep
  - Sends a status report SMS to all configured phone numbers
  - Includes system uptime, GSM status, and active triggers
  - Key can be released back to ignition or off position

- **Held in Starter Position** (≥ 2 seconds): Shuts down the Raspberry Pi
  - Plays descending melody (Melody Down)
  - Safely shuts down the system
  - Raspberry Pi will power off

---

## 🚀 Quick Start Guide

### Prerequisites

- Raspberry Pi (any model with GPIO)
- GSM module (recommended Huawei E3372 USB modem stick)
- Active SIM card with SMS capability
- PIR sensors (HC-SR501 or similar)
- Node.js and npm installed

### Installation

1. **Clone or download the project:**

   ```bash
   cd ~/PiGuard
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Find your serial port:**

   ```bash
   npm run list-ports
   ```

   Note the port name (e.g., `/dev/ttyUSB0` or `/dev/ttyAMA0`)

4. **Create configuration file:**

   ```bash
   cp env.example .env
   nano .env
   ```

5. **Configure your settings** (see [Configuration](#configuration) section below)

6. **Build the project:**

   ```bash
   npm run build
   ```

7. **Run the system:**
   ```bash
   npm start
   ```

---

## ⚙️ Configuration

All configuration is done through the `.env` file. Copy `env.example` to `.env` and edit it:

```bash
cp env.example .env
nano .env
```

### Essential Settings

#### Serial Port Configuration

```env
SERIAL_PORT=/dev/ttyUSB0          # Your GSM module serial port
SERIAL_BAUDRATE=9600               # Usually 9600 for SIM800L
```

#### GPIO Pin Configuration

```env
# Sensor triggers (BCM numbering)
GPIO_TRIGGER_1=23                  # First sensor pin
GPIO_TRIGGER_2=24                  # Second sensor pin
GPIO_TRIGGER_3=25                  # Third sensor pin

# Front panel components
GPIO_LED=8                         # Status LED pin
GPIO_SPK=7                         # Speaker pin
GPIO_SW1=19                        # Ignition switch - Ignition position (ON)
GPIO_SW2=26                        # Ignition switch - Starter position (START)
```

#### Trigger Names

```env
TRIGGER_1_NAME=Front Door          # Name for trigger 1
TRIGGER_2_NAME=Back Door           # Name for trigger 2
TRIGGER_3_NAME=Window              # Name for trigger 3
```

#### Phone Numbers

```env
PHONE_NUMBERS=+1234567890,+0987654321  # Comma-separated, include country code
```

### Advanced Settings

#### GSM Module Settings

```env
AT_COMMAND_TIMEOUT=5000            # Command timeout in milliseconds
AT_COMMAND_RETRY=3                 # Number of retry attempts
```

#### Feature Toggles

```env
DISABLE_WELCOME_SMS=0              # 0 = enabled, 1 = disabled
DISABLE_ALERT_SMS=0                # 0 = enabled, 1 = disabled
DISABLE_LED=0                      # 0 = enabled, 1 = disabled
DISABLE_SOUND=0                    # 0 = enabled, 1 = disabled
```

#### SMS Cooldown

```env
SMS_COOLDOWN_PERIOD=300000         # Milliseconds (300000 = 5 minutes)
```

#### GPIO Legacy Offset

```env
GPIO_LEGACY_OFFSET=512             # Usually 512 for newer Raspberry Pi OS
```

#### Web Server

```env
WEB_PORT=8080                      # Port for web control panel
```

### Configuration Tips

- **Phone numbers must include country code** (e.g., `+1234567890` for US)
- **GPIO pins use BCM numbering**, not physical pin numbers
- **Test your serial port** with `npm run list-ports` before configuring
- **Adjust cooldown period** to prevent SMS spam from multiple triggers

---

## 🏃 Running the System

### Development Mode

Run directly from TypeScript source (useful for testing):

```bash
npm run dev
```

### Production Mode

Build and run the compiled version:

```bash
npm run build
npm start
```

### Running as a Service

See the [Autostart Configuration](#autostart-configuration) section below for setting up PiGuard to run automatically on boot.

---

## 🌐 Web Control Panel

PiGuard includes a built-in web interface for monitoring and control.

### Accessing the Web Panel

1. **Start the system:**

   ```bash
   npm start
   ```

2. **Open your web browser:**
   - On the Raspberry Pi: `http://localhost:8080`
   - From another device on the same network: `http://<raspberry-pi-ip>:8080`
   - If using hotspot: `http://192.168.5.1:8080`

### Web Panel Features

The web control panel provides:

- **System Status**: View uptime, running status, and cooldown state
- **Input States**: Real-time view of all sensor triggers (DETECTED/CLEAR)
- **GSM Configuration**: View serial port settings, phone numbers, and GSM module status
- **Logs Viewer**: Browse recent system logs and error logs
- **Environment Editor**: Edit `.env` configuration file directly from the browser
- **Actions**:
  - Send diagnostic SMS
  - Reboot system
  - Shutdown system

### Using the Web Panel

1. **Monitor System Status:**

   - Check the dashboard for current system state
   - View which sensors are active (DETECTED) or clear

2. **Send Diagnostic SMS:**

   - Click "Send Diagnostic SMS" button
   - System will send a status report to all configured phone numbers
   - Useful for checking if the system is working remotely

3. **Edit Configuration:**

   - Navigate to the Environment section
   - Edit the `.env` file content
   - Save changes
   - Optionally reboot to apply changes immediately

4. **View Logs:**

   - Check recent system activity
   - Review error logs for troubleshooting
   - Logs are updated in real-time

5. **System Control:**
   - Reboot the Raspberry Pi remotely
   - Shutdown the system safely

---

## 🍓 Raspberry Pi Setup

### Connecting via SSH

SSH allows you to remotely access and control your Raspberry Pi.

#### Enable SSH on Raspberry Pi

1. **Using Raspberry Pi Imager** (recommended for new installations):

   - When flashing the OS, click the gear icon for advanced options
   - Enable SSH and set a password
   - Configure Wi-Fi if needed

2. **Using raspi-config** (on existing installation):

   ```bash
   sudo raspi-config
   ```

   - Navigate to: `Interface Options` → `SSH`
   - Select `Yes` to enable SSH
   - Reboot if prompted

3. **Manual method** (create empty file):
   ```bash
   sudo touch /boot/ssh
   sudo reboot
   ```

#### Finding Your Raspberry Pi's IP Address

**On the Raspberry Pi:**

```bash
hostname -I
```

**From another device on the same network:**

```bash
# Linux/Mac
arp -a | grep raspberrypi

# Or use nmap
nmap -sn 192.168.5.0/24 | grep -B 2 Raspberry
```

#### Connecting via SSH

**From Linux/Mac:**

```bash
ssh pi@<raspberry-pi-ip>
```

**From Windows:**

- Use PuTTY, Windows Terminal, or PowerShell
- Command: `ssh pi@<raspberry-pi-ip>`

**Example:**

```bash
ssh pi@192.168.5.1
```

---

### Setting Up Wi-Fi Hotspot

A Wi-Fi hotspot allows you to connect to your Raspberry Pi even without a router.

#### Using NetworkManager (nmcli) - Recommended

This is the simplest method and works with modern Raspberry Pi OS versions that include NetworkManager.

1. **Create the hotspot:**

   ```bash
   sudo nmcli device wifi hotspot ssid PiGuard password YourPassword123
   ```

   Replace `PiGuard` with your desired network name and `YourPassword123` with your password.

2. **Verify the hotspot is running:**

   ```bash
   nmcli connection show
   ```

   You should see a connection named "Hotspot" or "PiGuard".

3. **Configure the hotspot to use IP 192.168.5.1:**

   ```bash
   # Find the hotspot connection name
   nmcli connection show

   # Configure IP address (replace "Hotspot" with actual connection name if different)
   sudo nmcli connection modify Hotspot ipv4.addresses 192.168.5.1/24
   sudo nmcli connection modify Hotspot ipv4.method shared

   # Restart the hotspot to apply changes
   sudo nmcli connection down Hotspot
   sudo nmcli connection up Hotspot
   ```

4. **Verify the IP address:**

   ```bash
   ip addr show wlan0
   ```

   You should see `192.168.5.1` assigned to wlan0.

5. **Make it permanent (start on boot):**

   ```bash
   # Enable the hotspot connection to start automatically
   sudo nmcli connection modify Hotspot connection.autoconnect yes
   ```

   Or if the connection has a different name:

   ```bash
   # List connections to find the hotspot name
   nmcli connection show
   # Then enable autoconnect (replace "Hotspot" with actual name)
   sudo nmcli connection modify "Hotspot" connection.autoconnect yes
   ```

6. **Connect to hotspot:**
   - Disconnect your device from your regular Wi-Fi
   - Look for Wi-Fi network named "PiGuard" (or your custom name)
   - Connect using the password you set
   - Access web panel at: `http://192.168.5.1:8080`
   - SSH to: `ssh pi@192.168.5.1`

**Note:** Once the hotspot is active, the Pi will no longer be connected to your regular Wi-Fi network. You'll need to connect to the "PiGuard" hotspot to access the Pi.

**Troubleshooting connection issues:**

If you can see the hotspot but can't connect with your password:

1. **Check the current hotspot password:**

   ```bash
   nmcli connection show Hotspot | grep wifi-sec.psk
   ```

   This will show the current password configured for the hotspot.

2. **Recreate the hotspot with a new password:**

   ```bash
   # Delete the existing hotspot
   sudo nmcli connection delete Hotspot

   # Create a new hotspot with your desired password
   sudo nmcli device wifi hotspot ssid PiGuard password YourNewPassword123

   # Configure IP address again
   sudo nmcli connection modify Hotspot ipv4.addresses 192.168.5.1/24
   sudo nmcli connection modify Hotspot ipv4.method shared

   # Restart to apply
   sudo nmcli connection down Hotspot
   sudo nmcli connection up Hotspot
   ```

3. **Check hotspot status and logs:**

   ```bash
   # Check if hotspot is running
   nmcli connection show --active

   # Check NetworkManager logs for errors
   sudo journalctl -u NetworkManager -n 50
   ```

4. **Verify Wi-Fi security settings:**

   ```bash
   # Check security mode (should be WPA2)
   nmcli connection show Hotspot | grep wifi-sec
   ```

5. **If password is set but connection still fails:**

   The password might have special characters or encoding issues. Try these steps:

   ```bash
   # Stop the hotspot
   sudo nmcli connection down Hotspot

   # Delete and recreate with a simple password (letters and numbers only, 8+ characters)
   sudo nmcli connection delete Hotspot
   sudo nmcli device wifi hotspot ssid PiGuard password SimplePass123

   # Set IP address
   sudo nmcli connection modify Hotspot ipv4.addresses 192.168.5.1/24
   sudo nmcli connection modify Hotspot ipv4.method shared

   # Restart NetworkManager to ensure clean state
   sudo systemctl restart NetworkManager

   # Wait a few seconds, then start hotspot
   sleep 3
   sudo nmcli connection up Hotspot

   # Verify it's running
   iwconfig wlan0
   nmcli connection show --active
   ```

   **Common issues:**

   - **Special characters**: Some devices have trouble with special characters in passwords. Use only letters and numbers.
   - **Password length**: Ensure it's at least 8 characters.
   - **Case sensitivity**: Passwords are case-sensitive.
   - **Device compatibility**: Some older devices may have issues with WPA2. You can try WPA instead:
     ```bash
     sudo nmcli connection modify Hotspot wifi-sec.key-mgmt wpa-psk
     sudo nmcli connection modify Hotspot wifi-sec.proto wpa
     sudo nmcli connection down Hotspot
     sudo nmcli connection up Hotspot
     ```

6. **Check if the hotspot is actually broadcasting:**

   ```bash
   # On another device, scan for networks
   # You should see "PiGuard" in the list

   # On the Pi, check if AP mode is active
   iwconfig wlan0
   # Should show: Mode:Master (not Mode:Managed)

   # Check NetworkManager logs for errors
   sudo journalctl -u NetworkManager -n 100 | grep -i error
   ```

**To stop the hotspot:**

```bash
sudo nmcli connection down Hotspot
```

**To start it again:**

```bash
sudo nmcli connection up Hotspot
```

---

### Autostart Configuration

Set up PiGuard to start automatically when the Raspberry Pi boots.

#### Method 1: systemd Service (Recommended)

1. **Create service file:**

   ```bash
   sudo nano /etc/systemd/system/piguard.service
   ```

2. **Find the location of node:**

   First, find where node is installed:

   ```bash
   which node
   ```

   Common locations:

   - `/usr/bin/node` (system-wide installation)
   - `/usr/local/bin/node` (user installation)
   - `~/.nvm/versions/node/.../bin/node` (nvm installation)

3. **Add the following content to the service file:**

   **Option A: Using the startup script (Recommended):**

   ```ini
   [Unit]
   Description=PiGuard Surveillance System
   After=network.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=pi
   Group=dialout
   WorkingDirectory=/home/pi/PiGuard
   ExecStart=/home/pi/PiGuard/scripts/start.sh
   Restart=on-failure
   RestartSec=10
   StandardOutput=journal
   StandardError=journal
   Environment="NODE_ENV=production"
   # Load environment variables from .env file
   EnvironmentFile=/home/pi/PiGuard/.env
   # Wait for serial port to be available
   ExecStartPre=/bin/sleep 5

   [Install]
   WantedBy=multi-user.target
   ```

   **Option B: Using node directly (if startup script doesn't work):**

   If the startup script fails to find node, use the direct path. Replace `/usr/bin/node` with the actual path from `which node`:

   ```ini
   [Unit]
   Description=PiGuard Surveillance System
   After=network.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=pi
   Group=dialout
   WorkingDirectory=/home/pi/PiGuard
   ExecStart=/usr/bin/node dist/index.js
   Restart=on-failure
   RestartSec=10
   StandardOutput=journal
   StandardError=journal
   Environment="NODE_ENV=production"
   # Load environment variables from .env file
   EnvironmentFile=/home/pi/PiGuard/.env
   # Wait for serial port to be available
   ExecStartPre=/bin/sleep 5

   [Install]
   WantedBy=multi-user.target
   ```

   **Note:** If you're using nvm, you may need to use Option A (startup script) or create a wrapper script that sources nvm before running node.

   **Note:**

   - Adjust the `User` and `WorkingDirectory` paths if your setup is different
   - If using nvm, you may need to use Option A (startup script) or set up the environment properly

4. **Reload systemd and enable the service:**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable piguard.service
   sudo systemctl start piguard.service
   ```

5. **Check service status:**

   ```bash
   sudo systemctl status piguard.service
   ```

6. **View logs:**
   ```bash
   sudo journalctl -u piguard.service -f
   ```

#### Service Management Commands

```bash
# Start the service
sudo systemctl start piguard.service

# Stop the service
sudo systemctl stop piguard.service

# Restart the service
sudo systemctl restart piguard.service

# Check status
sudo systemctl status piguard.service

# View logs
sudo journalctl -u piguard.service -f

# Disable autostart
sudo systemctl disable piguard.service

# Enable autostart
sudo systemctl enable piguard.service
```

---
