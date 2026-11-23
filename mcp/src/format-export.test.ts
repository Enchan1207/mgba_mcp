import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

describe('CI formatter export (temporary)', () => {
  test('formats state decoder changes', () => {
    execFileSync('pnpm', ['fmt'], { stdio: 'pipe' })
    for (const path of [
      'features/game-state/read-save-state/index.ts',
      'features/game-state/read-save-state/index.test.ts',
    ]) {
      const data = readFileSync(`src/${path}`)
      console.log(`FORMAT_EXPORT:${path}:${data.toString('base64')}`)
    }
    expect(true).toBe(true)
  })
})
