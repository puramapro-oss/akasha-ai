import nextPlugin from 'eslint-config-next';
import tseslint from 'typescript-eslint';
import puramaConfig from '@purama/eslint-config';

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'mobile/**'],
  },
  ...nextPlugin,
  ...tseslint.configs.recommended,
  ...puramaConfig,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react/display-name': 'off',
    },
  },
];

export default config;
