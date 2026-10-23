// One config, three builds: `--mode client` (chat PWA), `--mode admin` (console) and `--mode sw` (service worker).
// Output goes to build/<mode>; scripts/build.mjs turns that into the release bundles in dist/.
// `npm run dev` / `npm run dev:admin` proxy /api to a local PHP server (CHATS_API, default http://localhost:8780).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(({ mode }) => {
  const define = {
    __CHATS_VERSION__: JSON.stringify(pkg.version),
    // Branded builds: CHATS_SERVER=chat.example.org locks the client to one server and skips the connect step.
    __CHATS_SERVER__: JSON.stringify(process.env.CHATS_SERVER || ''),
  };
  if (mode === 'sw') {
    return {
      define, publicDir: false,
      build: { outDir: 'build/sw', emptyOutDir: true, minify: true, lib: { entry: 'client/src/sw.js', formats: ['iife'], name: 'chatsSW', fileName: () => 'sw.js' } },
    };
  }
  const app = mode === 'admin' ? 'admin' : 'client';
  return {
    root: app,
    base: './',
    define,
    plugins: [preact(), viteSingleFile({ removeViteModuleLoader: true })],
    publicDir: app === 'client' ? 'public' : false,
    server: { proxy: { '/api': { target: process.env.CHATS_API || 'http://localhost:8780', changeOrigin: true } } },
    build: {
      outDir: `../build/${app}`, emptyOutDir: true, assetsInlineLimit: 100_000_000, cssCodeSplit: false, target: 'es2020',
      rollupOptions: { input: fileURLToPath(new URL(`./${app}/index.html`, import.meta.url)) },
    },
  };
});
