import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest } from './bootstrap-shared-packages.mjs';

const repository = 'https://github.com/puramapro-oss/purama-smarana.git';
// GitHub's published Ed25519 host key, verified on 2026-11-11:
// https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
const githubKnownHosts = 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n';

function cleanEnvironment(original) {
  const env = { ...original };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') || key.startsWith('SSH_') || [
      'SMARANA_READ_TOKEN', 'PURAMA_PACKAGES_READ_TOKEN',
      'SMARANA_READ_SSH_KEY', 'PURAMA_PACKAGES_READ_SSH_KEY',
      'GH_TOKEN', 'GITHUB_TOKEN',
    ].includes(key)) delete env[key];
  }
  return env;
}

/** Scoped authorization is available only during dependency acquisition. */
export function installationEnvironment(original, token) {
  if (typeof token !== 'string' || !token.trim() || /[\r\n\0]/.test(token)) {
    throw new Error('SMARANA_READ_TOKEN with read-only access is required.');
  }
  const env = cleanEnvironment(original);
  const values = [
    [`url.${repository}.insteadOf`, 'ssh://git@github.com/puramapro-oss/purama-smarana.git'],
    [`url.${repository}.insteadOf`, 'git@github.com:puramapro-oss/purama-smarana.git'],
    [`http.${repository}.extraHeader`, `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`],
    [`http.${repository}.followRedirects`, 'false'],
    ['credential.helper', ''],
  ];
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: String(values.length) });
  values.forEach(([key, value], index) => { env[`GIT_CONFIG_KEY_${index}`] = key; env[`GIT_CONFIG_VALUE_${index}`] = value; });
  return env;
}

export function sshInstallationEnvironment(original, keyFile, knownHostsFile) {
  for (const file of [keyFile, knownHostsFile]) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || /[\r\n\0]/.test(file)) {
      throw new Error('An absolute temporary SSH file path is required.');
    }
  }
  // Git runs GIT_SSH_COMMAND through a shell; quote only our owned file paths.
  const quote = value => `'${value.replace(/'/g, `'\\''`)}'`;
  // OpenSSH parses -o values again after the shell has removed its quoting.
  const configQuote = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return {
    ...cleanEnvironment(original),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
    GIT_ALLOW_PROTOCOL: 'https:ssh', GIT_SSH_VARIANT: 'ssh',
    GIT_SSH_COMMAND: [
      'ssh -F /dev/null', `-i ${quote(keyFile)}`,
      '-o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none',
      '-o StrictHostKeyChecking=yes -o HostKeyAlgorithms=ssh-ed25519',
      `-o ${quote(`UserKnownHostsFile=${configQuote(knownHostsFile)}`)} -o GlobalKnownHostsFile=/dev/null`,
      '-o PasswordAuthentication=no -o KbdInteractiveAuthentication=no',
      '-o ClearAllForwardings=yes -o ConnectTimeout=10 -o ConnectionAttempts=1',
    ].join(' '),
  };
}

function runInstallation(env, run) {
  // Lifecycle scripts execute only in the following, credential-free CI step.
  const result = run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    env, stdio: 'inherit', shell: false,
  });
  if (result.error) throw new Error('Could not start the locked dependency installation.');
  if (result.status !== 0) throw new Error('Locked dependency installation failed; verify private read access.');
}

export function installFromLock({ token, sshKey, env = process.env, run = spawnSync } = {}) {
  if (sshKey === undefined) return runInstallation(installationEnvironment(env, token), run);
  if (token !== undefined) throw new Error('Choose one private read credential transport.');
  if (typeof sshKey !== 'string' || !sshKey.trim() || sshKey.includes('\0') || sshKey.length > 32768) {
    throw new Error('SMARANA_READ_SSH_KEY with read-only access is required.');
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'akasha-smarana-ssh-'));
  try {
    chmodSync(directory, 0o700);
    const keyFile = path.join(directory, 'identity');
    const knownHostsFile = path.join(directory, 'known_hosts');
    writeFileSync(keyFile, `${sshKey.trim()}\n`, { mode: 0o600, flag: 'wx' });
    writeFileSync(knownHostsFile, githubKnownHosts, { mode: 0o600, flag: 'wx' });
    return runInstallation(sshInstallationEnvironment(env, keyFile, knownHostsFile), run);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const statIfPresent = file => {
  try { return lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

/** Read only manifest-listed blobs; historical root gitlinks are never checked out. */
export function retrieveSharedPackages({ sshKey, sourceRoot, manifest, env = process.env, run = spawnSync }) {
  validateManifest(manifest);
  if (manifest.files.length > 128 || manifest.files.reduce((sum, file) => sum + file.bytes, 0) > 4 * 1024 * 1024) {
    throw new Error('Shared source manifest exceeds the acquisition bound.');
  }
  if (typeof sshKey !== 'string' || !sshKey.trim() || sshKey.includes('\0') || sshKey.length > 32768) {
    throw new Error('PURAMA_PACKAGES_READ_SSH_KEY with read-only access is required.');
  }
  if (typeof sourceRoot !== 'string' || !path.isAbsolute(sourceRoot)) throw new Error('An absolute new source directory is required.');
  sourceRoot = path.resolve(sourceRoot);
  const parent = path.dirname(sourceRoot);
  if (realpathSync(parent) !== parent || statIfPresent(sourceRoot)) throw new Error('Shared source destination must be new in a controlled plain directory.');
  const parentIdentity = lstatSync(parent);
  const staging = mkdtempSync(path.join(parent, '.akasha-source-'));
  let directory;
  let promoted = false;
  try {
    directory = mkdtempSync(path.join(tmpdir(), 'akasha-master-ssh-'));
    chmodSync(directory, 0o700);
    const keyFile = path.join(directory, 'identity');
    const knownHostsFile = path.join(directory, 'known_hosts');
    writeFileSync(keyFile, `${sshKey.trim()}\n`, { mode: 0o600, flag: 'wx' });
    writeFileSync(knownHostsFile, githubKnownHosts, { mode: 0o600, flag: 'wx' });
    const gitEnvironment = sshInstallationEnvironment(env, keyFile, knownHostsFile);
    const gitDirectory = path.join(directory, 'repository.git');
    mkdirSync(gitDirectory, { mode: 0o700 });
    const deadline = Date.now() + 180000;
    const git = (args, maximumBytes = 1024 * 1024) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Shared source acquisition exceeded its time bound.');
      const result = run('git', args, { cwd: gitDirectory, env: gitEnvironment, shell: false,
        stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.min(90000, remaining), maxBuffer: maximumBytes });
      // Do not relay Git diagnostics that could include local credential paths.
      if (result.error || result.status !== 0) throw new Error('Shared source Git acquisition failed.');
      return Buffer.from(result.stdout ?? '');
    };
    git(['init', '--bare', '--template=', '--initial-branch=main']);
    git(['remote', 'add', 'origin', 'ssh://git@github.com/puramapro-oss/purama-master.git']);
    git(['config', '--local', 'remote.origin.promisor', 'true']);
    git(['config', '--local', 'remote.origin.partialclonefilter', 'blob:none']);
    git(['-c', 'protocol.version=2', 'fetch', '--no-tags', '--no-recurse-submodules', '--depth=1', '--filter=blob:none', 'origin', manifest.commit]);
    if (git(['rev-parse', 'FETCH_HEAD']).toString('utf8').trim() !== manifest.commit) throw new Error('Shared source revision mismatch.');
    const packagePaths = [...new Set(manifest.files.map(file => file.path.split('/').slice(0, 2).join('/')))];
    const entries = git(['ls-tree', '-r', '-z', '--full-tree', manifest.commit, '--', ...packagePaths])
      .toString('utf8').split('\0').filter(Boolean);
    const objects = new Map();
    for (const entry of entries) {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
      if (!match || objects.has(match[3])) throw new Error('Shared source contains an unsupported or duplicate tree entry.');
      objects.set(match[3], match[2]);
    }
    if (objects.size !== manifest.files.length || manifest.files.some(file => !objects.has(file.path))) {
      throw new Error('Shared source contains missing or unlisted files.');
    }
    for (const file of manifest.files) {
      const bytes = git(['cat-file', 'blob', objects.get(file.path)], Math.max(file.bytes + 1, 65536));
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        throw new Error('Shared source digest mismatch.');
      }
      const output = path.join(staging, file.path);
      mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
      writeFileSync(output, bytes, { mode: 0o644, flag: 'wx' });
    }
    const currentParent = lstatSync(parent);
    if (realpathSync(parent) !== parent || currentParent.dev !== parentIdentity.dev || currentParent.ino !== parentIdentity.ino
        || statIfPresent(sourceRoot)) throw new Error('Shared source destination changed during acquisition.');
    renameSync(staging, sourceRoot);
    promoted = true;
  } finally {
    try {
      if (!promoted) rmSync(staging, { recursive: true, force: true });
    } finally {
      if (directory) {
        rmSync(directory, { recursive: true, force: true });
        if (statIfPresent(directory)) throw new Error('Temporary shared source authentication remains.');
      }
    }
  }
  return { sourceCommit: manifest.commit, verifiedFiles: manifest.files.length, temporaryAuthenticationAbsent: true };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv[2] === '--shared-source' && process.argv.length === 4) {
      const manifest = JSON.parse(readFileSync(new URL('../tooling/shared-packages.lock.json', import.meta.url), 'utf8'));
      const result = retrieveSharedPackages({ sshKey: process.env.PURAMA_PACKAGES_READ_SSH_KEY, sourceRoot: process.argv[3], manifest });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else if (process.argv.length === 2) installFromLock({ token: process.env.SMARANA_READ_TOKEN, sshKey: process.env.SMARANA_READ_SSH_KEY });
    else throw new Error('Usage: node scripts/install-private-dependencies.mjs [--shared-source ABSOLUTE_NEW_SOURCE_DIRECTORY]');
  }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
