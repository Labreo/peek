// Bundles main, preload and renderer with esbuild.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'es2022' };

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js', platform: 'node', format: 'cjs',
    external: ['electron', 'node-hid', '@smartspectra/node-sdk', '@smartspectra/node-sdk/*'] }),
  // The preload bundles the SDK's own preload bridge so one preload serves both.
  build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload.js', platform: 'node', format: 'cjs',
    external: ['electron'] }),
  build({ ...common, entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer.js', platform: 'browser', format: 'iife' }),
]);
cpSync('src/renderer/index.html', 'dist/index.html');
cpSync('src/renderer/styles.css', 'dist/styles.css');
