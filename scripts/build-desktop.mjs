import { build } from 'esbuild';
await build({ entryPoints: ['desktop/main.ts'], outfile: 'desktop-build/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] });
await build({ entryPoints: ['desktop/preload.ts'], outfile: 'desktop-build/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] });
