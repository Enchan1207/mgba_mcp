import { McpTool } from '../../lib/mcp-tools'
import pressButton from './press-button'

const tool = new McpTool().route(pressButton)

export default tool
