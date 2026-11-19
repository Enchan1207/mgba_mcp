import { Result } from '@praha/byethrow'

import { createMgbaClient } from './external/mgba-client'
import { beginSocketConnection } from './lib/socket-client/connect'

const socket = await beginSocketConnection({
  path: '/private/tmp/mgba.sock',
  timeout: 10,
})

const client = createMgbaClient(socket)

await client.send({
  verb: 'connect',
  args: ['view'],
})

const response = await client.send({ verb: 'status' })
console.log(Result.unwrap(response))

const response2 = await client.send({ verb: 'press', args: ['start'] })
console.log(response2)
