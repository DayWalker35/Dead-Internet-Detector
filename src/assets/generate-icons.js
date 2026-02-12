// Quick icon generator using canvas-like SVG conversion
const fs = require('fs');
const sizes = [16, 48, 128];
for (const size of sizes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#ef4444"/><stop offset="100%" style="stop-color:#f97316"/>
  </linearGradient></defs>
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <text x="64" y="82" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="72" font-weight="900" fill="white">D</text>
</svg>`;
  fs.writeFileSync(`src/assets/icon-${size}.svg`, svg);
}
console.log('SVG icons generated. Convert to PNG with: npx svg2png-many src/assets/icon-*.svg');
