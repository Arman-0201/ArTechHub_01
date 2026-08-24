import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * ESLint flat config.
 *
 * `eslint-config-next` is still eslintrc-shaped, so it is bridged through
 * `FlatCompat` rather than spread directly. `next/core-web-vitals` carries the
 * React and a11y rules plus the Core Web Vitals checks; `next/typescript` adds
 * the TypeScript parser and rules.
 *
 * The `lint` script calls the ESLint CLI rather than `next lint`, which is
 * deprecated in 15 and removed in 16 — and which, with no config present,
 * blocks on an interactive prompt instead of failing.
 */
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
