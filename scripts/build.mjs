// Builds the client, the console and the service worker, then lays out the four release bundles in dist/:
//
//   dist/full/      chat app at /, console at /admin/, PHP API at /api/: one web root, nobody types a server address
//   dist/client/    the chat app alone (asks for the server, or is locked to CHATS_SERVER)
//   dist/admin/     the console as one self-contained HTML file
//   dist/api-php/   the PHP API alone, inside an api/ folder
import { build } from 'vite';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (...p) => join(root, 'build', ...p);
const dist = (...p) => join(root, 'dist', ...p);
const fail = msg => { console.error('build: ' + msg); process.exit(1); };

for (const mode of ['client', 'admin', 'sw']) await build({ configFile: join(root, 'vite.config.js'), mode, logLevel: 'warn' });

// The console has to work as a lone file (opened from disk or any host), so its icons go inside it.
{
  const file = out('admin', 'index.html');
  const icon = (name, type) => `data:${type};base64,${readFileSync(join(root, 'client', 'public', 'icons', name)).toString('base64')}`;
  const links = `<link rel="icon" href="${icon('favicon.svg', 'image/svg+xml')}" type="image/svg+xml">\n  <link rel="icon" href="${icon('favicon-32.png', 'image/png')}" sizes="32x32">\n`;
  writeFileSync(file, readFileSync(file, 'utf8').replace('</head>', `  ${links}</head>`));
}

// Content-Security-Policy pinned to the hash of each page's single inline bundle. Blob documents (decrypted files opened
// in a tab) inherit it, so even a mislabeled file can't run script with this origin. connect-src stays open because both
// apps talk to whichever CHATS server they are pointed at.
for (const file of [out('client', 'index.html'), out('admin', 'index.html')]) {
  let html = readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!scripts.length || /\son[a-z]+=["']/i.test(html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g, ''))) fail('unexpected inline code in ' + file);
  const hashes = scripts.map(s => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`).join(' ');
  const csp = [`default-src 'none'`, `script-src ${hashes} 'wasm-unsafe-eval'`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com`, `img-src 'self' data: blob:`, `media-src 'self' blob:`, `connect-src *`, `worker-src 'self'`,
    `manifest-src 'self'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`].join('; ');
  html = html.replace(/<meta charset="utf-8">/i, m => `${m}\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`);
  if (!html.includes('Content-Security-Policy')) fail('no <meta charset> in ' + file);
  writeFileSync(file, html);
}

// Apache rules for a folder that serves the chat app. nginx and Caddy equivalents are in deploy/.
const clientHtaccess = extra => `# CHATS (Apache). nginx and Caddy: see deploy/.
Options -Indexes
DirectoryIndex index.html index.php
<IfModule mod_rewrite.c>
  RewriteEngine On
${extra}  RewriteRule ^i/[A-Za-z0-9-]+/?$ index.html [L]
  RewriteRule ^share-target$ index.html [L]
</IfModule>
<IfModule mod_headers.c>
  <Files "sw.js">
    Header set Cache-Control "no-cache"
  </Files>
  <Files "index.html">
    Header set Cache-Control "no-cache"
  </Files>
</IfModule>
AddType application/manifest+json .webmanifest
`;
const copyClient = to => {
  cpSync(out('client'), to, { recursive: true });
  cpSync(out('sw', 'sw.js'), join(to, 'sw.js'));
};
const copyApi = to => cpSync(join(root, 'api', 'php'), to, { recursive: true, filter: src => !/[\\/](data|test|config\.local\.php|\.DS_Store)$/.test(src) });

rmSync(dist(), { recursive: true, force: true });

copyClient(dist('full'));
mkdirSync(dist('full', 'admin'), { recursive: true });
cpSync(out('admin', 'index.html'), dist('full', 'admin', 'index.html'));
copyApi(dist('full', 'api'));
writeFileSync(dist('full', '.htaccess'), clientHtaccess('  RewriteRule ^data(/|$) - [F,L]\n'));

copyClient(dist('client'));
writeFileSync(dist('client', '.htaccess'), clientHtaccess(''));

mkdirSync(dist('admin'), { recursive: true });
cpSync(out('admin', 'index.html'), dist('admin', 'chats-admin.html'));

copyApi(dist('api-php', 'api'));

const must = ['full/index.html', 'full/sw.js', 'full/manifest.webmanifest', 'full/admin/index.html', 'full/api/index.php', 'full/.htaccess',
  'client/index.html', 'client/sw.js', 'admin/chats-admin.html', 'api-php/api/index.php'];
for (const f of must) if (!existsSync(dist(f))) fail('missing dist/' + f);
if (/href="\.\.\/icons\//.test(readFileSync(dist('admin', 'chats-admin.html'), 'utf8'))) fail('console still links outside files');
console.log('dist ready: full/ · client/ · admin/chats-admin.html · api-php/' + (process.env.CHATS_SERVER ? ' · client locked to ' + process.env.CHATS_SERVER : ''));
