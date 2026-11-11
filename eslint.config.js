// Share the CI Web rules while preserving the local mobile exclusion.
import webConfig from './eslint.config.mjs';

const config = [
  { ignores: ['mobile/**'] },
  ...webConfig,
];

export default config;
