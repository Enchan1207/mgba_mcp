export const createExecutor = () => {
  let tail: Promise<unknown> = Promise.resolve()

  return <T>(task: () => Promise<T>) => {
    const result = tail.then(task)
    // oxlint-disable-next-line no-empty-function
    tail = result.catch(() => {})
    return result
  }
}
