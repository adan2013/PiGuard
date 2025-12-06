#!/bin/bash

# Build script for PiGuard
# Compiles TypeScript and copies necessary files to dist/

set -e  # Exit on error

echo "Building TypeScript..."
tsc

echo "Copying playSound.py to dist..."
cp src/playSound.py dist/playSound.py

echo "Build complete!"

