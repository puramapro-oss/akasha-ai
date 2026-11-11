import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installationEnvironment, installFromLock, retrieveSharedPackages, sshInstallationEnvironment } from './install-private-dependencies.mjs';

function effectiveSshSettings(env) {
  // -G only evaluates local SSH configuration. No connection or key generation.
  const result = spawnSync('/bin/sh', ['-c', `${env.GIT_SSH_COMMAND} -G git@github.com`], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return new Map(result.stdout.trim().split('\n').map(line => {
    const split = line.indexOf(' ');
    return [line.slice(0, split), line.slice(split + 1)];
  }));
}

test('real Git scopes the synthetic authorization header to the exact SMARANA repository only', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'akasha-git-scope-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const env = installationEnvironment({ PATH: process.env.PATH }, 'synthetic-test-token');
  const match = url => spawnSync('git', ['config', '--get-urlmatch', 'http.extraHeader', url], { cwd, env, encoding: 'utf8' });
  assert.match(match('https://github.com/puramapro-oss/purama-smarana.git/info/refs').stdout, /^Authorization: Basic /);
  for (const url of ['https://github.com/another/repo.git', 'https://github.com/puramapro-oss/purama-smarana.git-other', 'https://example.invalid/puramapro-oss/purama-smarana.git']) {
    assert.equal(match(url).status, 1);
    assert.equal(match(url).stdout, '');
  }
});

test('installation strips inherited Git tracing/config and leaves the parent environment unchanged', () => {
  const original = { PATH: '/synthetic/bin', SMARANA_READ_TOKEN: 'original', PURAMA_PACKAGES_READ_TOKEN: 'original-packages', GIT_TRACE: '1', GIT_CURL_VERBOSE: '1', GIT_ASKPASS: '/untrusted/askpass', GIT_CONFIG_VALUE_99: 'old-value' };
  const before = { ...original };
  const env = installationEnvironment(original, 'synthetic-test-token');
  assert.deepEqual(original, before);
  for (const name of ['SMARANA_READ_TOKEN', 'PURAMA_PACKAGES_READ_TOKEN', 'GIT_TRACE', 'GIT_CURL_VERBOSE', 'GIT_ASKPASS', 'GIT_CONFIG_VALUE_99']) assert.equal(env[name], undefined);
  assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(env.GIT_CONFIG_VALUE_3, 'false');
});

test('locked npm installation has no lifecycle execution, audit transmission, shell or credential argument', () => {
  const calls = [];
  installFromLock({ token: 'synthetic-test-token', env: { PATH: '/synthetic/bin' }, run: (...args) => { calls.push(args); return { status: 0 }; } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'npm');
  assert.deepEqual(calls[0][1], ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].env.SMARANA_READ_TOKEN, undefined);
});

test('missing/invalid credentials or unsuccessful installation fail without leaking the input', () => {
  for (const token of ['', undefined, 'bad\nvalue']) assert.throws(() => installationEnvironment({}, token), /read-only access is required/);
  assert.throws(() => installFromLock({ token: 'synthetic-test-token', run: () => ({ status: 128 }) }), /verify private read access/);
});

test('SSH installation uses a single temporary identity, verified host key and no inherited credentials', () => {
  const sshKey = 'synthetic-nonfunctional-test-key';
  const original = {
    PATH: process.env.PATH, SMARANA_READ_SSH_KEY: sshKey,
    PURAMA_PACKAGES_READ_SSH_KEY: 'unrelated-key', SMARANA_READ_TOKEN: 'unused-token',
    PURAMA_PACKAGES_READ_TOKEN: 'unused-packages-token', GH_TOKEN: 'unused-admin', GITHUB_TOKEN: 'unused-actions',
    SSH_AUTH_SOCK: '/untrusted/agent', SSH_ASKPASS: '/untrusted/askpass',
    GIT_TRACE: '1', GIT_CONFIG_VALUE_99: 'untrusted', GIT_SSH_COMMAND: 'untrusted-ssh',
  };
  const before = { ...original };
  let directory;
  let calls = 0;
  installFromLock({ sshKey, env: original, run: (command, args, options) => {
    calls++;
    assert.equal(command, 'npm');
    assert.deepEqual(args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.equal(options.shell, false);
    const settings = effectiveSshSettings(options.env);
    const keyFile = settings.get('identityfile');
    const knownHostsFile = settings.get('userknownhostsfile');
    directory = path.dirname(keyFile);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(keyFile).mode & 0o777, 0o600);
    assert.equal(statSync(knownHostsFile).mode & 0o777, 0o600);
    assert.equal(readFileSync(keyFile, 'utf8'), `${sshKey}\n`);
    const host = readFileSync(knownHostsFile, 'utf8').trim().split(/\s+/);
    assert.deepEqual(host.slice(0, 2), ['github.com', 'ssh-ed25519']);
    const fingerprint = createHash('sha256').update(Buffer.from(host[2], 'base64')).digest('base64').replace(/=+$/, '');
    assert.equal(fingerprint, '+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU');
    for (const [key, value] of Object.entries({
      batchmode: 'yes', identitiesonly: 'yes', identityagent: 'none',
      stricthostkeychecking: 'true', hostkeyalgorithms: 'ssh-ed25519',
      globalknownhostsfile: '/dev/null', passwordauthentication: 'no',
      kbdinteractiveauthentication: 'no', clearallforwardings: 'yes',
      connecttimeout: '10', connectionattempts: '1',
    })) assert.equal(settings.get(key), value, key);
    for (const key of Object.keys(original).filter(key => key !== 'PATH')) {
      if (key !== 'GIT_SSH_COMMAND') assert.equal(options.env[key], undefined, key);
    }
    assert.equal(Object.values(options.env).some(value => String(value).includes(sshKey)), false);
    assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null');
    assert.equal(options.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(options.env.GIT_ALLOW_PROTOCOL, 'https:ssh');
    const url = 'ssh://git@github.com/puramapro-oss/purama-smarana.git';
    const resolution = spawnSync('git', ['ls-remote', '--get-url', url], { env: options.env, encoding: 'utf8' });
    assert.equal(resolution.status, 0, resolution.stderr);
    assert.equal(resolution.stdout.trim(), url);
    return { status: 0 };
  } });
  assert.equal(calls, 1);
  assert.deepEqual(original, before);
  assert.equal(existsSync(directory), false);
});

for (const [scenario, outcome, message] of [
  ['Git/npm failure', () => ({ status: 128 }), /verify private read access/],
  ['spawn error', () => ({ error: new Error('synthetic-spawn-error') }), /Could not start/],
  ['timeout result', () => ({ status: null, error: Object.assign(new Error('synthetic-timeout'), { code: 'ETIMEDOUT' }) }), /Could not start/],
  ['thrown execution error', () => { throw new Error('synthetic-execution-error'); }, /synthetic-execution-error/],
]) {
  test(`SSH temporary files are removed after ${scenario}`, () => {
    let directory;
    assert.throws(() => installFromLock({
      sshKey: 'synthetic-nonfunctional-test-key', env: { PATH: process.env.PATH },
      run: (_command, _args, options) => {
        directory = path.dirname(effectiveSshSettings(options.env).get('identityfile'));
        assert.equal(existsSync(directory), true);
        return outcome();
      },
    }), message);
    assert.equal(existsSync(directory), false);
  });
}

test('SSH paths with spaces, quotes and shell syntax stay literal', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'akasha-ssh-path-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const identity = path.join(directory, "identity'$(printf injected) with spaces");
  const knownHosts = path.join(directory, "hosts'$(printf injected) with spaces");
  writeFileSync(identity, 'synthetic-nonfunctional-test-key', { mode: 0o600 });
  writeFileSync(knownHosts, '', { mode: 0o600 });
  const settings = effectiveSshSettings(sshInstallationEnvironment({ PATH: process.env.PATH }, identity, knownHosts));
  assert.equal(settings.get('identityfile'), identity);
  assert.equal(settings.get('userknownhostsfile'), knownHosts);
});

test('SSH invalid inputs and ambiguous transports fail before npm without exposing values', () => {
  let calls = 0;
  const run = () => { calls++; return { status: 0 }; };
  for (const sshKey of ['', '  ', null, 42, 'synthetic\0bad', 'x'.repeat(32769)]) {
    assert.throws(() => installFromLock({ sshKey, run }), /^Error: SMARANA_READ_SSH_KEY with read-only access is required\.$/);
  }
  assert.throws(() => installFromLock({ token: 'synthetic-token', sshKey: 'synthetic-key', run }), /Choose one private read credential transport/);
  for (const file of ['relative', '/tmp/bad\npath', '/tmp/bad\0path']) {
    assert.throws(() => sshInstallationEnvironment({}, file, '/tmp/known_hosts'), /absolute temporary SSH file path/);
  }
  assert.equal(calls, 0);
});

async function sharedSourceFixture(t, { symbolicLink = false, extraFile = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'akasha-shared-git-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, 'origin');
  await mkdir(repository);
  const env = { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = args => {
    const result = spawnSync('git', args, { cwd: repository, env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '-q']);
  git(['config', 'uploadpack.allowFilter', 'true']);
  git(['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  const files = [];
  for (const name of ['purama-antifraud', 'purama-entraide', 'eslint-config-purama']) {
    await mkdir(path.join(repository, 'packages', name), { recursive: true });
    for (let index = 0; index < 6; index++) {
      const relative = `packages/${name}/${index === 0 ? 'package.json' : `fixture-${index}.txt`}`;
      const bytes = Buffer.from(index === 0 ? JSON.stringify({ name, private: true }) : `synthetic ${name} ${index}\n`);
      writeFileSync(path.join(repository, relative), bytes);
      files.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  if (symbolicLink) {
    const target = path.join(repository, files[1].path);
    await rm(target);
    await symlink('/unrelated/source', target);
  }
  if (extraFile) writeFileSync(path.join(repository, 'packages/purama-antifraud/unlisted.txt'), 'synthetic unlisted content');
  git(['add', 'packages']);
  // The pinned private repository has this structural defect at its root.
  // This fixture contains no private source and never initializes a submodule.
  git(['update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},adya`]);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Synthetic shared source']);
  const manifest = { schemaVersion: 1, repository: 'puramapro-oss/purama-master', commit: git(['rev-parse', 'HEAD']), files };
  const observed = { commands: [], identities: new Set() };
  const run = (command, args, options) => {
    assert.equal(command, 'git');
    assert.equal(options.shell, false);
    assert.equal(options.env.PURAMA_PACKAGES_READ_SSH_KEY, undefined);
    assert.equal(options.env.SMARANA_READ_SSH_KEY, undefined);
    observed.commands.push(args);
    observed.identities.add(path.dirname(effectiveSshSettings(options.env).get('identityfile')));
    // Exercise real Git fetching, partial-clone blob reads and tree parsing,
    // replacing only network transport with this local upload-pack fixture.
    const localEnv = { ...options.env, GIT_ALLOW_PROTOCOL: 'file', GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_1: `url.${pathToFileURL(repository).href}.insteadOf`,
      GIT_CONFIG_VALUE_1: 'ssh://git@github.com/puramapro-oss/purama-master.git' };
    return spawnSync(command, args, { ...options, env: localEnv });
  };
  return { root, repository, env, manifest, run, observed, sourceRoot: path.join(root, 'source') };
}

function assertSharedCleanup(fixture) {
  for (const directory of fixture.observed.identities) assert.equal(existsSync(directory), false);
  assert.equal(readdirSync(fixture.root).some(name => name.startsWith('.akasha-source-')), false);
}

test('real Git reproduces the root gitlink cleanup failure and retrieves exactly 18 verified blobs without checkout', async t => {
  const fixture = await sharedSourceFixture(t);
  const before = spawnSync('git', ['submodule', 'foreach', '--recursive', 'true'], { cwd: fixture.repository, env: fixture.env, encoding: 'utf8' });
  assert.equal(before.status, 128);
  assert.match(before.stderr, /No url found for submodule path 'adya' in .gitmodules/);
  const result = retrieveSharedPackages({ ...fixture, sshKey: 'synthetic-nonfunctional-key' });
  assert.deepEqual(result, { sourceCommit: fixture.manifest.commit, verifiedFiles: 18, temporaryAuthenticationAbsent: true });
  assert.deepEqual(readdirSync(fixture.sourceRoot), ['packages']);
  for (const file of fixture.manifest.files) {
    const content = readFileSync(path.join(fixture.sourceRoot, file.path));
    assert.equal(content.length, file.bytes);
    assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256);
  }
  assert.equal(fixture.observed.commands.some(args => args.includes('checkout') || args.includes('submodule')), false);
  assertSharedCleanup(fixture);
});

for (const [scenario, options, expected] of [
  ['wrong digest', {}, /digest mismatch/],
  ['symlink in an admitted package', { symbolicLink: true }, /unsupported or duplicate tree entry/],
  ['unlisted package file', { extraFile: true }, /missing or unlisted files/],
]) {
  test(`real Git source acquisition rejects ${scenario} and removes owned staging/authentication`, async t => {
    const fixture = await sharedSourceFixture(t, options);
    if (scenario === 'wrong digest') fixture.manifest.files[0].sha256 = '0'.repeat(64);
    assert.throws(() => retrieveSharedPackages({ ...fixture, sshKey: 'synthetic-nonfunctional-key' }), expected);
    assert.equal(existsSync(fixture.sourceRoot), false);
    assertSharedCleanup(fixture);
  });
}

for (const command of ['fetch', 'cat-file']) {
  test(`source ${command} failure cannot publish partial files or retain authentication`, async t => {
    const fixture = await sharedSourceFixture(t);
    const run = (program, args, options) => {
      if (args.includes(command)) return { status: 128, stderr: Buffer.from('synthetic diagnostic must not be propagated') };
      return fixture.run(program, args, options);
    };
    assert.throws(() => retrieveSharedPackages({ ...fixture, run, sshKey: 'synthetic-nonfunctional-key' }), /^Error: Shared source Git acquisition failed\.$/);
    assert.equal(existsSync(fixture.sourceRoot), false);
    assertSharedCleanup(fixture);
  });
}

test('new source acquisition preserves an existing target and rejects out-of-scope paths before Git', async t => {
  const fixture = await sharedSourceFixture(t);
  await mkdir(fixture.sourceRoot);
  writeFileSync(path.join(fixture.sourceRoot, 'keep.txt'), 'preserved');
  assert.throws(() => retrieveSharedPackages({ ...fixture, sshKey: 'synthetic-nonfunctional-key' }), /must be new/);
  assert.equal(readFileSync(path.join(fixture.sourceRoot, 'keep.txt'), 'utf8'), 'preserved');
  for (const unsafePath of ['packages/purama-antifraud/../escape', 'packages/other/file', '/tmp/escape']) {
    const manifest = { ...fixture.manifest, files: [{ ...fixture.manifest.files[0], path: unsafePath }, ...fixture.manifest.files.slice(1)] };
    assert.throws(() => retrieveSharedPackages({ ...fixture, manifest, sshKey: 'synthetic-nonfunctional-key' }), /Invalid or duplicate/);
  }
  assert.equal(fixture.observed.commands.length, 0);
});
