#!/bin/bash
# Install script for AK Alheri Chemist
echo "Installing dependencies..."
npm install
echo "Building icons..."
node scripts/resize-icons.cjs
echo "Setup complete. Run 'npm run tauri dev' to start."
