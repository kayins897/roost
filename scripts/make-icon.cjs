const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');
(async () => {
  const root = path.resolve(__dirname, '../build');
  const png = await sharp(path.join(root, 'icon.svg')).resize(256, 256).png().toBuffer();
  fs.writeFileSync(path.join(root, 'icon.png'), png);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(root, 'icon.ico'), Buffer.concat([header, png]));
})().catch(error => { console.error(error); process.exitCode = 1; });
