import nextPlugin from 'eslint-config-next';

export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  ...nextPlugin,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react/display-name': 'off',
    },
  },
];
