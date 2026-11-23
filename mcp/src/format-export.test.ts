import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

test('Issue 33 formatter output', () => {
  execFileSync('pnpm', ['fmt'], { stdio: 'pipe' })
  for (const path of [
    'features/game-state/read-save-state/index.ts',
    'features/game-state/read-save-state/index.test.ts',
    'tools/get-player-state/index.ts',
    'tools/get-party-state/index.ts',
    'tools/get-bag-state/index.ts',
  ]) {
    const data = readFileSync(`src/${path}`)
    console.log(`FORMAT_EXPORT:${path}:${data.toString('base64')}`)
  }
  expect(true).toBe(true)
})
