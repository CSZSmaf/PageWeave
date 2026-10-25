import { build } from 'esbuild';
await build({entryPoints:['cli/main.ts'],bundle:true,platform:'node',format:'cjs',target:'node24',outfile:'dist-electron/cli.cjs'});
await build({ entryPoints: ['electron/main.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: 'dist-electron/main.cjs', external: ['electron'] });
await build({ entryPoints: ['electron/preload.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: 'dist-electron/preload.cjs', external: ['electron'] });
