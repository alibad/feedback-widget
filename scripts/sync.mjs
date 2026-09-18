/**
 * Brings the working copy of the skill into this repository, and refuses to let
 * content change without the version moving.
 *
 *   node scripts/sync.mjs [--check] [--bump patch|minor|major] [--from <dir>]
 *
 * The skill is authored in place — `~/.claude/skills/add-feedback-widget` is
 * what Claude actually loads, so that is where it gets edited and proven. This
 * repository is a publication target, and nothing connected the two. They drift
 * in one direction, quietly, and the version number does not move because
 * nothing asks it to.
 *
 * It had already happened. On 2026-09-07 the microphone default was changed from
 * OFF to ON-with-disclosure in SKILL.md and common-pitfalls.md — a change to what
 * every future install *does*. Eleven days later this repository still carried the
 * old behaviour, both copies stamped `13.0.0`, and the only commit in between
 * touched the README. Anyone who installed the plugin had a version number that
 * claimed to be current and content that was not.
 *
 * `verify.mjs` cannot catch this: it checks that the manifests agree with each
 * other and that the file inventory is what someone reviewed. Every one of those
 * held while the content silently diverged. Agreement between copies of a number
 * is not agreement about what the number refers to.
 *
 * So: `--check` reports drift and fails, and an apply must name a bump. The
 * version cannot stay still while the content moves.
 */

import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = 'skills/add-feedback-widget';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const check = argv.includes('--check');
const bump = flag('bump');
const from = resolve(flag('from') ?? join(homedir(), '.claude', 'skills', 'add-feedback-widget'));

/** Every file under a directory, as paths relative to it. Skips editor debris. */
function walk(base, dir = base, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(base, path, out);
    else out.push(relative(base, path).split(sep).join('/'));
  }
  return out;
}

export function compare(sourceFiles, repoFiles, read) {
  const added = sourceFiles.filter((f) => !repoFiles.includes(f));
  const removed = repoFiles.filter((f) => !sourceFiles.includes(f));
  const changed = sourceFiles
    .filter((f) => repoFiles.includes(f))
    .filter((f) => read.source(f) !== read.repo(f));
  return { added, removed, changed };
}

/** `13.0.0` + `minor` → `13.1.0` */
export function nextVersion(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump "${kind}" — use patch, minor or major`);
}

/**
 * The version appears in five places and `verify.mjs` requires all five to
 * agree, so they are rewritten together or not at all.
 */
export const VERSION_FILES = [
  ['package.json', (t, v) => t.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`)],
  ['.claude-plugin/plugin.json', (t, v) => t.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`)],
  ['.codex-plugin/plugin.json', (t, v) => t.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`)],
  [`${SKILL}/SKILL.md`, (t, v) => bumpSkillVersion(t, v)],
  // Both release archives are named after the version; missing one leaves the
  // README advertising a zip that no release will ever contain.
  ['README.md', (t, v) => t.replace(/(add-feedback-widget|feedback-widget-plugin)-\d+\.\d+\.\d+\.zip/g, `$1-${v}.zip`)],
];

/** The `version:` line in a SKILL.md frontmatter block, and only that. */
export const bumpSkillVersion = (text, version) => text.replace(/(\n\s+version:\s*)\S+/, `$1${version}`);

function applyVersion(version) {
  for (const [file, rewrite] of VERSION_FILES) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    writeFileSync(path, rewrite(readFileSync(path, 'utf8'), version));
  }
}

function main() {
  if (!existsSync(from)) {
    console.error(`No working skill at ${from}. Pass --from <dir>.`);
    return 1;
  }
  const sourceFiles = walk(from).sort();
  const repoFiles = walk(resolve(root, SKILL)).sort();
  const read = {
    source: (f) => readFileSync(join(from, f), 'utf8'),
    repo: (f) => readFileSync(resolve(root, SKILL, f), 'utf8'),
  };
  const { added, removed, changed } = compare(sourceFiles, repoFiles, read);

  for (const f of changed) console.log(`  changed  ${f}`);
  for (const f of added) console.log(`  added    ${f}`);
  for (const f of removed) console.log(`  removed  ${f}`);

  if (!changed.length && !added.length && !removed.length) {
    console.log('  In step with the working skill.');
    return 0;
  }
  if (check) {
    console.error('\nThe published skill is behind the working copy. Run: npm run sync -- --bump <patch|minor|major>');
    return 1;
  }
  if (!bump) {
    // The whole point. Content moving while the version sits still is the
    // failure this script exists to make impossible.
    console.error('\nContent changed, so the version must move too:');
    console.error('  npm run sync -- --bump patch   a wording or clarity fix');
    console.error('  npm run sync -- --bump minor   new guidance, or changed default behaviour');
    console.error('  npm run sync -- --bump major   guidance that reverses something previously advised');
    return 1;
  }
  if (added.length || removed.length) {
    // release-files.json is a reviewed inventory, not a generated one, and
    // verify.mjs fails until a human has reconciled it.
    console.error('\nFiles were added or removed. Update release-files.json deliberately, then re-run.');
    return 1;
  }

  for (const f of changed) {
    const dest = resolve(root, SKILL, f);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(from, f), dest);
  }
  const current = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  const version = nextVersion(current, bump);
  applyVersion(version);

  // The working skill carries the new version too. Without this the two copies
  // differ by exactly the version line from here on, and `--check` reports drift
  // forever — a guard that cries wolf is one nobody reads.
  const sourceSkill = join(from, 'SKILL.md');
  writeFileSync(sourceSkill, bumpSkillVersion(readFileSync(sourceSkill, 'utf8'), version));

  console.log(`\n  Synced ${changed.length} file(s); version ${current} → ${version} (working copy too).`);
  console.log('  Now run: npm run verify');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
