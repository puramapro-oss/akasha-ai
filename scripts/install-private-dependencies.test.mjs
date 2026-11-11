import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installationEnvironment, installFromLock } from './install-private-dependencies.mjs';

test('real Git scopes the synthetic authorization header to the exact SMARANA repository only', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'midas-git-scope-'));
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
