import { Command } from 'commander';

export const serveCommand = new Command('serve')
  .description('Start the Velcro server (hook receiver and MCP server)')
  .option('-c, --config <path>', 'Config file path')
  .option('-p, --port <number>', 'Server port', '3010')
  .option('-H, --host <string>', 'Server host', 'localhost')
  .option('-s, --stdio', 'Run MCP server in stdio mode (default: HTTP mode)')
  .action(async (options) => {
    console.log('Starting Velcro server...');
    console.log('Options:', options);
    
    if (options.stdio) {
      // Import and start stdio server
      const { startServer } = await import('../../server/index.js');
      await startServer({
        port: parseInt(options.port),
        host: options.host,
        stdio: true
      });
    } else {
      // Import and start HTTP server (default)
      const { startHTTPServer } = await import('../../server/http-server.js');
      await startHTTPServer({
        port: parseInt(options.port),
        host: options.host
      });
    }
  });