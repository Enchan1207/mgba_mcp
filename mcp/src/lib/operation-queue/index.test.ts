import { createOperationQueue } from './index.js'

describe('createOperationQueue', () => {
  let order: string[] = []
  let results: PromiseSettledResult<number>[] = []

  beforeAll(async () => {
    const queue = createOperationQueue()
    let releaseFirst: (() => void) | undefined
    const first = queue.run(async () => {
      order.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push('first:end')
      throw new Error('first failed')
    })
    const second = queue.run(async () => {
      order.push('second')
      return 2
    })
    await Promise.resolve()
    releaseFirst?.()
    results = await Promise.allSettled([first, second])
  })

  test('操作を投入順に実行する', () => {
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  test('失敗した操作の後も次の操作を実行する', () => {
    expect(results[1]).toEqual({ status: 'fulfilled', value: 2 })
  })

  describe('終了した場合', () => {
    let pending: PromiseSettledResult<number>[] = []
    let executed = false

    beforeAll(async () => {
      const queue = createOperationQueue()
      let releaseFirst: (() => void) | undefined
      const first = queue.run(
        () =>
          new Promise<number>((resolve) => {
            releaseFirst = () => resolve(1)
          }),
      )
      const second = queue.run(async () => {
        executed = true
        return 2
      })
      await Promise.resolve()
      queue.close()
      releaseFirst?.()
      pending = await Promise.allSettled([first, second])
    })

    test('待機中の操作を失敗させる', () => {
      expect(pending[1]?.status).toBe('rejected')
    })

    test('待機中の操作を実行しない', () => {
      expect(executed).toBe(false)
    })
  })
})
