import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, mkdir, mkdtemp, rename, rm, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageNames = ['purama-antifraud', 'purama-entraide', 'eslint-config-purama'];
const defaultManifest = new URL('../tooling/shared-packages.lock.json', import.meta.url);
const sha256 = data => createHash('sha256').update(data).digest('hex');

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.repository !== 'puramapro-oss/purama-master'
      || !/^[a-f0-9]{40}$/.test(manifest.commit ?? '') || /^0+$/.test(manifest.commit)) {
    throw new Error('A verified immutable private package source commit is required.');
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Package file manifest is empty.');
  const seen = new Set();
  for (const file of manifest.files) {
    const parts = typeof file.path === 'string' ? file.path.split('/') : [];
    if (parts.length < 3 || parts[0] !== 'packages' || !packageNames.includes(parts[1])
        || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..' || part === '.git')
        || seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '')
        || !Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      throw new Error('Invalid or duplicate package file manifest entry.');
    }
    seen.add(file.path);
  }
  for (const name of packageNames) {
    if (!seen.has(`packages/${name}/package.json`)) throw new Error(`Missing package manifest: ${name}`);
  }
  return manifest;
}

async function statIfPresent(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

const sameIdentity = (left, right) => left === null ? right === null
  : right !== null && left.dev === right.dev && left.ino === right.ino && left.isDirectory() === right.isDirectory();

async function assertPlainAncestors(directory) {
  const absolute = path.resolve(directory);
  const parts = absolute.slice(path.parse(absolute).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(absolute).root;
  for (const part of parts) {
    current = path.join(current, part);
    const stat = await statIfPresent(current);
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Package directory must not contain symlinks or non-directories.');
  }
}

async function packageFiles(directory, prefix = '') {
  const found = new Map();
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    const full = path.join(directory, item.name);
    if (item.isDirectory()) {
      for (const [name, bytes] of await packageFiles(full, relative)) found.set(name, bytes);
    } else if (item.isFile()) found.set(relative, await readFile(full));
    else throw new Error('Package source contains a symlink or unsupported file.');
  }
  return found;
}

async function verifyPackage(directory, expected) {
  await assertPlainAncestors(directory);
  const files = await packageFiles(directory);
  if (files.size !== expected.length) throw new Error('Package contains missing or unlisted files.');
  for (const file of expected) {
    const relative = file.path.split('/').slice(2).join('/');
    const bytes = files.get(relative);
    if (!bytes || bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
      throw new Error(`Package source digest mismatch: ${file.path}`);
    }
  }
  return files;
}

/** Verify all sources and existing targets before creating any package directory. */
export async function bootstrapSharedPackages({ sourceRoot, destinationRoot, manifest }) {
  validateManifest(manifest);
  sourceRoot = path.resolve(sourceRoot);
  destinationRoot = path.resolve(destinationRoot);
  await assertPlainAncestors(sourceRoot);
  await assertPlainAncestors(destinationRoot);
  const originalDestination = await statIfPresent(destinationRoot);
  const sources = new Map();
  const unchanged = [];
  for (const name of packageNames) {
    const expected = manifest.files.filter(file => file.path.startsWith(`packages/${name}/`));
    sources.set(name, await verifyPackage(path.join(sourceRoot, 'packages', name), expected));
    const destination = path.join(destinationRoot, name);
    if (await statIfPresent(destination)) {
      await verifyPackage(destination, expected);
      unchanged.push(name);
    }
  }
  // A fully matching existing layout requires no write. Partial/shared layouts
  // are never merged into: use a new isolated sibling directory for bootstrap.
  if (unchanged.length === packageNames.length) {
    await assertPlainAncestors(destinationRoot);
    if (!sameIdentity(originalDestination, await statIfPresent(destinationRoot))) throw new Error('Package destination changed during verification.');
    return { sourceCommit: manifest.commit, verifiedFiles: manifest.files.length, installed: [], unchanged };
  }
  if (originalDestination && (await readdir(destinationRoot)).length) {
    throw new Error('Package destination is partial or contains unrelated files; choose a new isolated workspace. Existing files were preserved.');
  }
  const parent = path.dirname(destinationRoot);
  await mkdir(parent, { recursive: true });
  await assertPlainAncestors(parent);
  const parentIdentity = await lstat(parent);
  const staging = await mkdtemp(path.join(parent, '.akasha-shared-packages-'));
  const stagingIdentity = await lstat(staging);
  let promoted = false;
  try {
    for (const name of packageNames) {
      for (const [relative, bytes] of sources.get(name)) {
        const file = path.join(staging, name, relative);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes, { mode: 0o644, flag: 'wx' });
      }
    }
    await assertPlainAncestors(parent);
    if (!sameIdentity(parentIdentity, await statIfPresent(parent))
        || !sameIdentity(originalDestination, await statIfPresent(destinationRoot))) {
      throw new Error('Package destination or parent changed during staging.');
    }
    // One rename publishes the complete directory. Unlike mkdir + per-package
    // writes, rename(directory, symlink) refuses a raced final symlink instead
    // of following it. The caller must control the parent workspace throughout.
    await rename(staging, destinationRoot);
    promoted = true;
  } finally {
    if (!promoted && sameIdentity(stagingIdentity, await statIfPresent(staging))) {
      await rm(staging, { recursive: true, force: true });
    }
  }
  return { sourceCommit: manifest.commit, verifiedFiles: manifest.files.length, installed: [...packageNames], unchanged: [] };
}

async function main() {
  const manifest = validateManifest(JSON.parse(await readFile(defaultManifest, 'utf8')));
  if (process.argv[2] === '--github-output') {
    if (!process.env.GITHUB_OUTPUT) throw new Error('GitHub output file is unavailable.');
    await appendFile(process.env.GITHUB_OUTPUT, `commit=${manifest.commit}\n`);
    return;
  }
  if (process.argv.length !== 4) throw new Error('Usage: node scripts/bootstrap-shared-packages.mjs SOURCE_CHECKOUT DESTINATION_PACKAGES');
  const result = await bootstrapSharedPackages({ sourceRoot: process.argv[2], destinationRoot: process.argv[3], manifest });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
