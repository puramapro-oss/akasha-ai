import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import fsPromises, { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapSharedPackages, validateManifest } from './bootstrap-shared-packages.mjs';

const names = ['purama-antifraud', 'purama-entraide', 'eslint-config-purama'];

test('the committed manifest covers every sibling file dependency and exports a pinned CI revision', async t => {
  const manifest = validateManifest(JSON.parse(await readFile(new URL('../tooling/shared-packages.lock.json', import.meta.url), 'utf8')));
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const siblingNames = Object.values({ ...packageJson.dependencies, ...packageJson.devDependencies })
    .filter(value => value.startsWith('file:../packages/')).map(value => value.slice('file:../packages/'.length));
  assert.deepEqual(siblingNames.sort(), [...names].sort());
  const directory = await mkdtemp(path.join(tmpdir(), 'akasha-package-output-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'output');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./bootstrap-shared-packages.mjs', import.meta.url)), '--github-output'], {
    env: { ...process.env, GITHUB_OUTPUT: output }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(output, 'utf8'), `commit=${manifest.commit}\n`);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'akasha-package-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'source');
  const destinationRoot = path.join(root, 'destination', 'packages');
  const manifest = { schemaVersion: 1, repository: 'puramapro-oss/purama-master', commit: 'a'.repeat(40), files: [] };
  for (const name of names) {
    for (const [relative, content] of [['package.json', JSON.stringify({ name, private: true })], ['src/index.ts', 'export const syntheticFixture = true;\n']]) {
      const file = `packages/${name}/${relative}`;
      await mkdir(path.dirname(path.join(sourceRoot, file)), { recursive: true });
      await writeFile(path.join(sourceRoot, file), content);
      manifest.files.push({ path: file, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
    }
  }
  return { root, sourceRoot, destinationRoot, manifest };
}

test('clean offline bootstrap copies only exact manifest files; a second run is idempotent', async t => {
  const input = await fixture(t);
  const first = await bootstrapSharedPackages(input);
  assert.equal(first.verifiedFiles, 6);
  assert.deepEqual(first.installed, names);
  for (const file of input.manifest.files) {
    const installed = await readFile(path.join(input.destinationRoot, file.path.slice('packages/'.length)));
    assert.equal(createHash('sha256').update(installed).digest('hex'), file.sha256);
  }
  const second = await bootstrapSharedPackages(input);
  assert.deepEqual(second.installed, []);
  assert.deepEqual(second.unchanged, names);
  assert.deepEqual((await readdir(path.dirname(input.destinationRoot))).sort(), ['packages']);
});

test('the workflow sparse checkout patterns exclude unrelated private root files in real Git', async t => {
  const input = await fixture(t);
  await writeFile(path.join(input.sourceRoot, 'unrelated-private-file.txt'), 'synthetic unrelated root content');
  await writeFile(path.join(input.sourceRoot, 'packages/provenance.json'), 'synthetic unrelated package content');
  const workflow = await readFile(new URL('../.github/workflows/web-ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /sparse-checkout-cone-mode: false/);
  const patterns = workflow.match(/          sparse-checkout: \|\n((?:            \/packages\/[^\n]+\n)+)/)?.[1]
    .trim().split('\n').map(line => line.trim());
  assert.deepEqual(new Set(patterns), new Set(names.map(name => `/packages/${name}/`)));
  const runGit = (cwd, args, stdin) => {
    const result = spawnSync('git', args, {
      cwd, input: stdin, encoding: 'utf8',
      env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' },
    });
    assert.equal(result.status, 0, result.stderr);
  };
  runGit(input.sourceRoot, ['init', '--quiet']);
  runGit(input.sourceRoot, ['add', '.']);
  runGit(input.sourceRoot, ['-c', 'user.name=Offline fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic sparse checkout fixture']);
  const checkout = path.join(input.root, 'checkout');
  runGit(input.root, ['clone', '--quiet', '--no-checkout', '--', input.sourceRoot, checkout]);
  runGit(checkout, ['sparse-checkout', 'set', '--no-cone', '--stdin'], `${patterns.join('\n')}\n`);
  runGit(checkout, ['checkout', '--quiet']);
  for (const name of names) await readFile(path.join(checkout, 'packages', name, 'package.json'));
  await assert.rejects(readFile(path.join(checkout, 'unrelated-private-file.txt')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(checkout, 'packages/provenance.json')), { code: 'ENOENT' });
});

for (const corruption of ['changed', 'missing', 'extra', 'symlink']) {
  test(`a ${corruption} source fails before any destination is created`, async t => {
    const input = await fixture(t);
    const file = path.join(input.sourceRoot, 'packages/purama-entraide/src/index.ts');
    if (corruption === 'changed') await writeFile(file, 'altered source');
    if (corruption === 'missing') await rm(file);
    if (corruption === 'extra') await writeFile(path.join(path.dirname(file), 'unlisted.ts'), 'unexpected');
    if (corruption === 'symlink') { await rm(file); await symlink(path.join(input.sourceRoot, 'packages/purama-antifraud/src/index.ts'), file); }
    await assert.rejects(bootstrapSharedPackages(input));
    await assert.rejects(readdir(input.destinationRoot), { code: 'ENOENT' });
  });
}

test('a divergent existing package is preserved and prevents installation of the missing packages', async t => {
  const input = await fixture(t);
  const target = path.join(input.destinationRoot, names[0]);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'package.json'), 'existing local content');
  await assert.rejects(bootstrapSharedPackages(input));
  assert.equal(await readFile(path.join(target, 'package.json'), 'utf8'), 'existing local content');
  assert.deepEqual(await readdir(input.destinationRoot), [names[0]]);
});

test('a valid but partial shared destination is preserved and must not be merged into', async t => {
  const input = await fixture(t);
  await mkdir(input.destinationRoot, { recursive: true });
  await cp(path.join(input.sourceRoot, 'packages', names[0]), path.join(input.destinationRoot, names[0]), { recursive: true });
  await assert.rejects(bootstrapSharedPackages(input), /partial/);
  assert.deepEqual(await readdir(input.destinationRoot), [names[0]]);
  for (const file of input.manifest.files.filter(file => file.path.startsWith(`packages/${names[0]}/`))) {
    assert.deepEqual(await readFile(path.join(input.destinationRoot, file.path.slice('packages/'.length))), await readFile(path.join(input.sourceRoot, file.path)));
  }
});

test('an empty destination is admitted and replaced with the complete verified layout', async t => {
  const input = await fixture(t);
  await mkdir(input.destinationRoot, { recursive: true });
  const result = await bootstrapSharedPackages(input);
  assert.deepEqual(result.installed, names);
  assert.deepEqual((await readdir(input.destinationRoot)).sort(), [...names].sort());
});

test('a symlink destination cannot redirect package writes outside the chosen directory', async t => {
  const input = await fixture(t);
  const other = path.join(input.root, 'unrelated');
  await mkdir(other); await mkdir(path.dirname(input.destinationRoot));
  await symlink(other, input.destinationRoot);
  await assert.rejects(bootstrapSharedPackages(input), /symlink/);
  assert.deepEqual(await readdir(other), []);
});

test('a destination symlink introduced during staging cannot redirect the package installation', async t => {
  const input = await fixture(t);
  const outside = path.join(input.root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'sentinel.txt'), 'unrelated content');
  await mkdir(path.dirname(input.destinationRoot));
  const stagingPrefix = path.join(path.resolve(path.dirname(input.destinationRoot)), '.akasha-shared-packages-');
  const realMkdtemp = fsPromises.mkdtemp;
  let interceptions = 0;
  const stagingMock = t.mock.method(fsPromises, 'mkdtemp', async (prefix, options) => {
    const staging = await realMkdtemp(prefix, options);
    if (prefix === stagingPrefix) {
      assert.equal((await fsPromises.lstat(staging)).isDirectory(), true);
      await symlink(outside, input.destinationRoot);
      interceptions += 1;
    }
    return staging;
  });
  try {
    // Keep real filesystem I/O; synchronize the substitution before staging can continue.
    syncBuiltinESMExports();
    await assert.rejects(bootstrapSharedPackages(input), /destination or parent changed during staging/);
    assert.equal(interceptions, 1, 'fixture must interleave once after initial checks and before promotion');
    assert.equal(stagingMock.mock.callCount(), 1);
    assert.equal(await fsPromises.readlink(input.destinationRoot), outside);
    assert.deepEqual(await readdir(outside), ['sentinel.txt']);
    assert.equal(await readFile(path.join(outside, 'sentinel.txt'), 'utf8'), 'unrelated content');
    assert.deepEqual(await readdir(path.dirname(input.destinationRoot)), ['packages']);
  } finally {
    stagingMock.mock.restore();
    syncBuiltinESMExports();
    assert.equal(fsPromises.mkdtemp, realMkdtemp);
    assert.equal(mkdtemp, realMkdtemp);
  }
});

test('mutable refs, foreign repositories and traversal/duplicate file entries are rejected', async t => {
  const { manifest } = await fixture(t);
  for (const commit of [null, 'main', '0'.repeat(40), 'a'.repeat(39)]) {
    assert.throws(() => validateManifest({ ...manifest, commit }));
  }
  assert.throws(() => validateManifest({ ...manifest, repository: 'untrusted/example' }));
  for (const file of ['packages/purama-antifraud/../outside.ts', 'packages/purama-antifraud/.git/config', '/absolute.ts']) {
    assert.throws(() => validateManifest({ ...manifest, files: [{ ...manifest.files[0], path: file }, ...manifest.files.slice(1)] }));
  }
  assert.throws(() => validateManifest({ ...manifest, files: [...manifest.files, manifest.files[0]] }));
});
