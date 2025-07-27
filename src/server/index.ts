import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMCPServer } from './mcp-handlers.js';

// Start server in stdio mode
export async function startServer(options: { port?: number, host?: string, stdio?: boolean } = {}) {
  if (!options.stdio) {
    throw new Error('This function only supports stdio mode. Use startHTTPServer for HTTP mode.');
  }
  
  // Create MCP server
  const mcpServer = createMCPServer();
  
  // Create stdio transport
  const transport = new StdioServerTransport();
  
  // Connect server to transport
  await mcpServer.connect(transport);
  
  console.error('Velcro MCP server running in stdio mode');
}