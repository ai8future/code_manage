import nextPlugin from 'eslint-config-next';

const config = [
  ...nextPlugin,
  {
    ignores: ['node_modules/**', '.next/**', 'dist/**'],
  },
];

export default config;
