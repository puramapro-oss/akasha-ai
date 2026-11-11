import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'https://github.com/puramapro-oss/purama-smarana.git';

/** Credentials exist only in this installation process and its Git child. */
export function installationEnvironment(original, token) {
  if (typeof token !== 'string' || !token.trim() || /[\r\n\0]/.test(token)) {
    throw new Error('SMARANA_READ_TOKEN with read-only access is required.');
  }
  const env = { ...original };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') || ['SMARANA_READ_TOKEN', 'PURAMA_PACKAGES_READ_TOKEN'].includes(key)) delete env[key];
  }
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

export function installFromLock({ token, env = process.env, run = spawnSync } = {}) {
  // Lifecycle scripts execute only in the following, credential-free CI step.
  const result = run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    env: installationEnvironment(env, token), stdio: 'inherit', shell: false,
  });
  if (result.error) throw new Error('Could not start the locked dependency installation.');
  if (result.status !== 0) throw new Error('Locked dependency installation failed; verify private read access.');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { installFromLock({ token: process.env.SMARANA_READ_TOKEN }); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
