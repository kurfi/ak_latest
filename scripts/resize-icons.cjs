const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICON_SOURCE = path.join(__dirname, '../icon.png');
const PUBLIC_DIR = path.join(__dirname, '../public');

async function resize() {
  try {
    console.log('Resizing icons...');
    
    await sharp(ICON_SOURCE)
      .resize(192, 192)
      .toFile(path.join(PUBLIC_DIR, 'pwa-192x192.png'));
      
    await sharp(ICON_SOURCE)
      .resize(512, 512)
      .toFile(path.join(PUBLIC_DIR, 'pwa-512x512.png'));
      
    console.log('Icons generated successfully.');
  } catch (error) {
    console.error('Error resizing icons:', error);
  }
}

resize();
