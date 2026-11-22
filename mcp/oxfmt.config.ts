import { defineConfig } from 'oxfmt'

export default defineConfig({
  semi: false,
  singleQuote: true,
  printWidth: 80,
  trailingComma: 'all',
  ignorePatterns: ['package.json'],
})
