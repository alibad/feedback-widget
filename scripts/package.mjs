import { readFileSync, mkdirSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, ['scripts/verify.mjs', '--release'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['--test', 'skills/add-feedback-widget/tests/linear-provider.test.mjs'], { cwd: root, stdio: 'inherit' });
const files = JSON.parse(readFileSync(join(root, 'release-files.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), 'feedback-widget-package-'));
const names = [];
try {
  for (const [kind, folder, selected] of [
    ['plugin', 'feedback-widget', files],
    ['skill', 'add-feedback-widget', files.filter(file => file.startsWith('skills/add-feedback-widget/')).concat('LICENSE')],
  ]) {
    const paths = [];
    for (const file of selected) {
      const rel = kind === 'skill' ? file.replace(/^skills\/add-feedback-widget\//, '') : file;
      const target = join(staging, folder, rel);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, file), target);
      paths.push(`${folder}/${rel}`);
    }
    const name = kind === 'skill' ? `add-feedback-widget-${version}.zip` : `feedback-widget-plugin-${version}.zip`;
    // New archive in a unique directory: no stale members from an older build.
    const archive = join(staging, name);
    execFileSync('zip', ['-X', '-q', archive, ...paths], { cwd: staging });
    copyFileSync(archive, join(dist, name));
    names.push(name);
  }
  writeFileSync(join(dist, 'SHA256SUMS.txt'), names.map(name =>
    `${createHash('sha256').update(readFileSync(join(dist, name))).digest('hex')}  ${name}\n`).join(''));
  console.log(`Packaged ${names.join(' and ')} from the reviewed inventory.`);
} finally {
  // Only this script's newly created, uniquely named staging directory.
  rmSync(staging, { recursive: true });
}
