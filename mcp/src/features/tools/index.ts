import { McpTool } from '../../lib/mcp-tools'
import getScreen from './get-screen'
import pressButton from './press-button'
import wait from './wait'
import walkFor from './walk-for'

const tool = new McpTool()
  .route(pressButton)
  .route(walkFor)
  .route(wait)
  .route(getScreen)

export default tool
