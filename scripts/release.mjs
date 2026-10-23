// Packs dist/ (from scripts/build.mjs) into the GitHub release assets plus SHA256SUMS, in dist/release/.
// Needs the `zip` command (preinstalled on macOS and GitHub's Ubuntu runners).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = 'v' + JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const dist = (...p) => join(root, 'dist', ...p);
const rel = (...p) => dist('release', ...p);
if (!existsSync(dist('full', 'index.html'))) { console.error('release: run npm run build first'); process.exit(1); }

rmSync(rel(), { recursive: true, force: true });
mkdirSync(rel(), { recursive: true });
const zip = (cwd, name, args = ['.']) => execFileSync('zip', ['-q', '-r', '-X', rel(name), ...args, '-x', '*.DS_Store'], { cwd });

zip(dist('full'), `chats-full-${v}.zip`);
// Same files without the root .htaccess, for upgrading an install whose .htaccess has local lines (e.g. a cPanel PHP handler).
zip(dist('full'), `chats-update-${v}.zip`, ['.', '-x', '.htaccess']);
zip(dist('client'), `chats-client-${v}.zip`);
copyFileSync(dist('admin', 'chats-admin.html'), rel(`chats-admin-${v}.html`));
zip(dist('api-php'), `chats-api-php-${v}.zip`);

const files = readdirSync(rel()).sort();
writeFileSync(rel('SHA256SUMS'), files.map(f => createHash('sha256').update(readFileSync(rel(f))).digest('hex') + '  ' + f).join('\n') + '\n');
for (const f of [...files, 'SHA256SUMS']) console.log(f.padEnd(34), (readFileSync(rel(f)).length / 1024).toFixed(0).padStart(6) + ' KB');
