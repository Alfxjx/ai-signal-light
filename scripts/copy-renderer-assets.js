const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const destDir = path.join(__dirname, '..', 'dist', 'renderer');

const files = ['technical-support.png', 'graph.png'];

for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[copy-assets] ${file} -> dist/renderer/`);
  } else {
    console.warn(`[copy-assets] ${file} not found in src/renderer/`);
  }
}
