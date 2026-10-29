const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '../..');
const target = path.resolve(process.argv[2] || path.join(root, 'evidence/reading-workspace-preview'));
(async () => {
  fs.mkdirSync(target, { recursive: true });
  await build({ entryPoints: [path.join(__dirname, 'main.tsx')], outfile: path.join(target, 'preview.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2022', jsx: 'automatic', external: ['./fonts/*'], define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'eof' });
  fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(target, 'index.html'));
  fs.copyFileSync(path.join(__dirname, 'serve.cjs'), path.join(target, 'serve.cjs'));
  fs.mkdirSync(path.join(target, 'fonts'), { recursive: true });
  for (const name of ['InterVariable.woff2', 'Inter-OFL.txt', 'NotoSansSC-VF.ttf', 'NotoSansSC-OFL.txt']) fs.copyFileSync(path.join(root, 'public/fonts', name), path.join(target, 'fonts', name));
  console.log('Preview built: ' + target);
})().catch(error => { console.error(error); process.exitCode = 1; });
