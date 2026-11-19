import { Result } from '@praha/byethrow'
import { describe, expect, test } from 'vitest'

import type { MgbaServerCommand } from '.'
import { parseCommand } from '.'

describe('parseCommand', () => {
  const validCases: { command: MgbaServerCommand; expected: string }[] = [
    {
      command: { verb: 'connect', args: ['control'] },
      expected: 'HELLO CONTROL',
    },
    { command: { verb: 'connect', args: ['view'] }, expected: 'HELLO VIEW' },
    { command: { verb: 'press', args: ['a'] }, expected: 'PRESS A' },
    { command: { verb: 'release', args: ['all'] }, expected: 'RELEASE ALL' },
    {
      command: { verb: 'type', args: ['start', 18000] },
      expected: 'TYPE START 18000',
    },
    { command: { verb: 'step', args: [1] }, expected: 'STEP 1' },
    { command: { verb: 'read', args: [65535, 1] }, expected: 'READ FFFF 1' },
    { command: { verb: 'read', args: [0, 65536] }, expected: 'READ 0 65536' },
    { command: { verb: 'reset' }, expected: 'RESET' },
    { command: { verb: 'status' }, expected: 'STATUS' },
    { command: { verb: 'capture' }, expected: 'CAPTURE' },
    {
      command: { verb: 'wait_frame', args: [120000] },
      expected: 'WAIT_FRAME 120000',
    },
    { command: { verb: 'quit' }, expected: 'QUIT' },
  ]

  test.each(validCases)('$expected を生成する', ({ command, expected }) => {
    expect(parseCommand(command)).toStrictEqual(Result.succeed(`${expected}\n`))
  })

  const invalidCases: { command: MgbaServerCommand; name: string }[] = [
    { command: { verb: 'type', args: ['a', 0] }, name: 'TYPE の下限未満' },
    { command: { verb: 'type', args: ['a', 18001] }, name: 'TYPE の上限超過' },
    { command: { verb: 'step', args: [1.5] }, name: 'STEP の小数' },
    { command: { verb: 'read', args: [-1, 1] }, name: 'READ の負のアドレス' },
    {
      command: { verb: 'read', args: [65536, 1] },
      name: 'READ の範囲外アドレス',
    },
    { command: { verb: 'read', args: [65535, 2] }, name: 'READ の範囲超過' },
    { command: { verb: 'read', args: [0, 0] }, name: 'READ のゼロバイト' },
    { command: { verb: 'read', args: [1.5, 1] }, name: 'READ の小数アドレス' },
    { command: { verb: 'read', args: [0, 1.5] }, name: 'READ の小数バイト数' },
    {
      command: { verb: 'wait_frame', args: [0] },
      name: 'WAIT_FRAME の下限未満',
    },
    {
      command: { verb: 'wait_frame', args: [1.5] },
      name: 'WAIT_FRAME の小数',
    },
    {
      command: { verb: 'wait_frame', args: [120001] },
      name: 'WAIT_FRAME の上限超過',
    },
  ]

  test.each(invalidCases)('$name を拒否する', ({ command }) => {
    expect(Result.isFailure(parseCommand(command))).toBe(true)
  })
})
