import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (file, reason) => { throw new Error(`${file}: ${reason}`); };
const actual = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (directory === root && ['.git', 'node_modules', 'dist'].includes(name)) continue;
    const path = resolve(directory, name);
    const file = relative(root, path).split(sep).join('/');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail(file, 'symlinks are not allowed in a release');
    if (stat.isDirectory()) walk(path);
    else if (stat.isFile()) actual.push(file);
    else fail(file, 'unexpected filesystem entry');
  }
}
walk(root);
const listed = JSON.parse(readFileSync(resolve(root, 'release-files.json'), 'utf8'));
if (!Array.isArray(listed) || new Set(listed).size !== listed.length ||
    [...listed].sort().join('\n') !== actual.sort().join('\n')) {
  fail('release-files.json', 'release inventory differs; review each added/removed file explicitly');
}

const privateTermsPath = process.env.FEEDBACK_AUDIT_TERMS_FILE;
const privateTerms = privateTermsPath ? readFileSync(privateTermsPath, 'utf8')
  .split(/\r?\n/).map(x => x.trim().toLowerCase()).filter(Boolean) : [];
const rules = [
  ['credential-like value', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|lin_api_[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,})/],
  ['personal absolute path', /\/(?:Users|home)\/[a-z][a-z0-9._-]*\//i],
  ['email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
];
const publicHosts = new Set(['docs.github.com', 'developer.mozilla.org', 'cheatsheetseries.owasp.org',
  'code.claude.com', 'support.claude.com', 'example.com', 'www.w3.org', 'learn.chatgpt.com']);
for (const file of actual) {
  if (/(?:^|\/)(?:\.env(?:\.|$)|\.github\/workflows\/)|\.(?:pem|key|log|zip)$/i.test(file)) {
    fail(file, 'sensitive or generated file is not permitted');
  }
  const text = readFileSync(resolve(root, file), 'utf8');
  if (text.includes('\0')) fail(file, 'binary or NUL data is not permitted');
  for (const [reason, pattern] of rules) if (pattern.test(text)) fail(file, reason);
  if (privateTerms.some(term => text.toLowerCase().includes(term))) fail(file, 'private audit term found');
  for (const match of text.matchAll(/https?:\/\/[^\s<>`"')]+/g)) {
    const url = new URL(match[0]);
    const github = url.hostname === 'github.com' && /^\/alibad\/feedback-widget(?:\/|$)/.test(url.pathname);
    const linear = url.hostname === 'linear.app' && /^(?:\/developers\/|\/docs\/|\/example\/issue\/)/.test(url.pathname);
    const api = url.hostname === 'api.linear.app' && url.pathname === '/graphql';
    const website = url.protocol === 'https:' && url.hostname === 'feedback.humanquest.net' && url.pathname === '/' && !url.search;
    if (!publicHosts.has(url.hostname) && !github && !linear && !api && !website) fail(file, 'unreviewed URL host/path');
    if (url.username || url.password) fail(file, 'credential-bearing URL');
  }
  if (file.endsWith('.md')) {
    const fences = text.split('\n').filter(line => /^```/.test(line)).length;
    if (fences % 2) fail(file, 'unclosed code fence');
    const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
    for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|#)/.test(target)) continue;
      const dest = resolve(dirname(resolve(root, file)), target.split('#')[0]);
      if (!dest.startsWith(root + sep) || !existsSync(dest)) fail(file, 'missing or escaping relative link');
    }
  }
}

const claude = JSON.parse(readFileSync(resolve(root, '.claude-plugin/plugin.json')));
const codex = JSON.parse(readFileSync(resolve(root, '.codex-plugin/plugin.json')));
const market = JSON.parse(readFileSync(resolve(root, '.claude-plugin/marketplace.json')));
const entry = readFileSync(resolve(root, 'skills/add-feedback-widget/SKILL.md'), 'utf8');
if (claude.name !== 'feedback-widget' || codex.name !== claude.name || codex.version !== claude.version ||
    !entry.includes(`version: ${claude.version}`) || market.name !== claude.name ||
    market.plugins.length !== 1 || market.plugins[0].name !== claude.name || market.plugins[0].source !== './') {
  fail('manifests', 'name, version, or source mismatch');
}
for (const manifest of [claude, codex]) {
  if (manifest.mcpServers || manifest.hooks || manifest.apps) fail('manifest', 'unexpected executable integration');
}
if (process.argv.includes('--release') && !existsSync(resolve(root, 'LICENSE'))) {
  fail('LICENSE', 'publication blocked until the publisher approves a license and provenance');
}
console.log(`Verified ${actual.length} explicitly inventoried text files, links, versions, and exposure checks.`);
console.log(privateTerms.length ? 'Private-term check passed (terms are not printed).' : 'No private-term list supplied; known-secret/URL/path checks are not proof of ownership or confidentiality.');
if (!existsSync(resolve(root, 'LICENSE'))) console.log('DRAFT ONLY: public release remains blocked on license/provenance approval.');
