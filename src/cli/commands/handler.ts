import { Command } from 'commander';
import { logger } from '../../logging/logger.js';
import { HookData } from '../../types/hooks.js';

export const handlerCommand = new Command('handler')
  .description('Submit hook data from Claude Code to the server')
  .option('--server <url>', 'Server URL', 'http://localhost:3010')
  .option('--timeout <ms>', 'Request timeout', '5000')
  .option('--async', "Don't wait for response")
  .option('--debug', 'Enable debug logging')
  .action(async (options) => {
    try {
      // Read hook data from stdin
      let inputData = '';
      
      // Set stdin to UTF-8 encoding
      process.stdin.setEncoding('utf8');
      
      // Read all data from stdin
      for await (const chunk of process.stdin) {
        inputData += chunk;
      }
      
      if (!inputData.trim()) {
        console.error('No hook data received from stdin');
        process.exit(1);
      }
      
      // Parse the hook data
      let hookData: HookData;
      try {
        hookData = JSON.parse(inputData);
      } catch (e) {
        console.error('Failed to parse hook data as JSON:', e);
        process.exit(1);
      }
      
      // Log the hook data
      logger.logHook(hookData);
      
      if (options.debug) {
        // Only show debug output when explicitly requested
        console.error(`[Velcro] ${hookData.hook_event_name} hook logged`);
        console.error(`[Velcro] Log directory: ${logger.getLogDirectory()}`);
      }
      
      // Try to send to server if configured
      if (options.server !== 'disabled') {
        try {
          const timeout = parseInt(options.timeout);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch(`${options.server}/hooks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(hookData),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok && options.debug) {
            console.error(`[Velcro] Server returned ${response.status}`);
          }
          
          if (!options.async && response.ok) {
            // Parse the aggregated results
            interface ExecuteResponse {
              output?: string;
              blocked?: boolean;
              blockingHandler?: string;
              blockingMessage?: string;
              reason?: string;
            }
            const results = await response.json() as ExecuteResponse;
            
            // Output any successful handler outputs to stdout (for Claude to see)
            if (results.output) {
              console.log(results.output);
            }
            
            // If any handler blocked, exit with code 2
            if (results.blocked) {
              // Build blocking message
              let blockingMsg = '';
              if (results.blockingHandler) {
                blockingMsg = `Handler ${results.blockingHandler} blocked execution`;
              }
              if (results.blockingMessage) {
                blockingMsg = blockingMsg ? `${blockingMsg}\n${results.blockingMessage}` : results.blockingMessage;
              }
              if (results.reason) {
                // CCGuard-style reason
                blockingMsg = blockingMsg ? `${blockingMsg}\n${results.reason}` : results.reason;
              }
              
              if (blockingMsg) {
                console.error(blockingMsg);
              }
              process.exit(2);
            }
          }
        } catch (error: unknown) {
          if (options.debug) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Velcro] Failed to send to server: ${errorMessage}`);
          }
        }
      }
      
      process.exit(0);
      
    } catch (error) {
      console.error('Error processing hook:', error);
      process.exit(1);
    }
  });