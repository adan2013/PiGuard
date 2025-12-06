#!/bin/bash

# PiGuard startup script for systemd
# This script ensures the proper environment is loaded

cd /home/pi/PiGuard || exit 1

# Source user profile to get npm/node in PATH
if [ -f ~/.bashrc ]; then
    source ~/.bashrc
fi

if [ -f ~/.profile ]; then
    source ~/.profile
fi

# Try to find node
NODE_PATH=$(which node 2>/dev/null)
if [ -z "$NODE_PATH" ]; then
    # Common locations for node
    if [ -f /usr/local/bin/node ]; then
        NODE_PATH=/usr/local/bin/node
    elif [ -f /usr/bin/node ]; then
        NODE_PATH=/usr/bin/node
    else
        echo "Error: node not found in PATH"
        exit 1
    fi
fi

# Execute the application
exec "$NODE_PATH" dist/index.js

