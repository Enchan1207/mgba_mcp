export const createOperationQueue = () => {
  let previous: Promise<void> = Promise.resolve()
  let closed = false

  return {
    run: <T>(operation: () => Promise<T>): Promise<T> => {
      const result = previous.then(() => {
        if (closed) {
          throw new Error('Operation queue is closed')
        }
        return operation()
      })
      previous = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    close: () => {
      closed = true
    },
  }
}
