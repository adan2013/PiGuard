#!/bin/bash

# PiGuard startup script for systemd
# This script ensures the proper environment is loaded

cd /home/pi/PiGuard || exit 1

# Wait for serial port to be available (if using USB device)
if [ -n "$SERIAL_PORT" ] && [[ "$SERIAL_PORT" == /dev/ttyUSB* ]]; then
    timeout=10
    while [ ! -e "$SERIAL_PORT" ] && [ $timeout -gt 0 ]; do
        sleep 1
        timeout=$((timeout - 1))
    done
fi

# Try to find node in common locations
NODE_PATH=""

# Check common system-wide locations first (most reliable)
if [ -x /usr/bin/node ]; then
    NODE_PATH=/usr/bin/node
elif [ -x /usr/local/bin/node ]; then
    NODE_PATH=/usr/local/bin/node
# Check if nvm is installed and try to use it
elif [ -f /home/pi/.nvm/nvm.sh ]; then
    export NVM_DIR="/home/pi/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    NODE_PATH=$(command -v node 2>/dev/null)
# Try sourcing user profile as fallback
elif [ -f /home/pi/.bashrc ]; then
    export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/pi/.local/bin"
    source /home/pi/.bashrc 2>/dev/null
    NODE_PATH=$(command -v node 2>/dev/null)
elif [ -f /home/pi/.profile ]; then
    export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/pi/.local/bin"
    source /home/pi/.profile 2>/dev/null
    NODE_PATH=$(command -v node 2>/dev/null)
fi

# If still not found, try which with full PATH
if [ -z "$NODE_PATH" ]; then
    export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/pi/.local/bin"
    NODE_PATH=$(command -v node 2>/dev/null)
fi

# Final check - if node still not found, exit with error
if [ -z "$NODE_PATH" ] || [ ! -x "$NODE_PATH" ]; then
    echo "Error: node not found. Please install Node.js or update the script with the correct path."
    echo "Checked locations: /usr/bin/node, /usr/local/bin/node"
    echo "To find node location, run: which node"
    exit 1
fi

# Execute the application
exec "$NODE_PATH" dist/index.js

