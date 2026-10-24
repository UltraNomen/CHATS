// One version for the whole release. `npm run version:set 2.7.0` writes it to package.json and the PHP API;
// `node scripts/version.mjs --check [tag]` fails when they disagree (or don't match a pushed git tag), for CI.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgFile = join(root, 'package.json'), lockFile = join(root, 'package-lock.json'), phpFile = join(root, 'api', 'php', 'lib', 'config.php');
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
const php = readFileSync(phpFile, 'utf8');
const phpVer = (/const CHATS_VERSION = 'v([^']+)';/.exec(php) || [])[1];
const [arg, tag] = process.argv.slice(2);

if (arg === '--check') {
  const want = tag ? tag.replace(/^refs\/tags\//, '').replace(/^v/, '') : pkg.version;
  const bad = [pkg.version !== want && `package.json is ${pkg.version}`, phpVer !== want && `api/php/lib/config.php is ${phpVer}`].filter(Boolean);
  if (bad.length) { console.error(`version mismatch, expected ${want}: ${bad.join(', ')}`); process.exit(1); }
  console.log('version ' + want + ' ok');
} else if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(arg || '')) {
  pkg.version = arg;
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  lock.version = arg;
  if (lock.packages && lock.packages['']) lock.packages[''].version = arg;
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(phpFile, php.replace(/const CHATS_VERSION = 'v[^']+';/, `const CHATS_VERSION = 'v${arg}';`));
  console.log(`version set to ${arg} · add a CHANGELOG.md entry, commit, then tag v${arg}`);
} else {
  console.error('usage: npm run version:set 2.7.0   |   node scripts/version.mjs --check [v2.7.0]');
  process.exit(1);
}
