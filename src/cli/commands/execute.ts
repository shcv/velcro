import { Command } from 'commander';
import { configManager } from '../../config/index.js';
import { HandlerExecutor } from '../../handlers/executor.js';
import { HookData } from '../../types/hooks.js';
import { readFileSync } from 'fs';

export const executeCommand = new Command('execute')
  .description('Execute a handler directly')
  .argument('<handler>', 'Handler name')
  .option('-e, --event <json>', 'Event data (JSON string or @file.json)')
  .option('-t, --timeout <ms>', 'Execution timeout in milliseconds')
  .option('--no-stats', 'Skip recording execution statistics')
  .action(async (handlerName, options) => {
    try {
      const handler = configManager.getHandler(handlerName);
      if (!handler) {
        console.error(`Handler '${handlerName}' not found`);
        process.exit(1);
      }
      
      if (!handler.enabled) {
        console.warn(`Warning: Handler '${handlerName}' is disabled`);
      }
      
      // Parse event data
      let eventData: HookData;
      if (options.event) {
        if (options.event.startsWith('@')) {
          const filePath = options.event.slice(1);
          eventData = JSON.parse(readFileSync(filePath, 'utf-8'));
        } else {
          eventData = JSON.parse(options.event);
        }
      } else {
        // Default event for manual execution
        eventData = {
          hook_event_name: 'PreToolUse',
          tool_name: 'manual-execution',
          tool_input: { manual: true },
          session_id: 'manual-execution',
          transcript_path: '/tmp/manual-execution.log',
          cwd: process.cwd()
        } as HookData;
      }
      
      // Show what we're executing
      console.log(`Executing handler '${handlerName}'`);
      console.log('Event data:');
      console.log(JSON.stringify(eventData, null, 2));
      console.log('\n--- Handler Output ---\n');
      
      // Execute the handler
      const executor = new HandlerExecutor();
      const startTime = Date.now();
      
      try {
        await executor.execute(handler, eventData);
        const duration = Date.now() - startTime;
        
        console.log('\n--- Execution Complete ---');
        console.log(`Duration: ${duration}ms`);
        console.log('Status: Success');
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        
        console.error('\n--- Execution Failed ---');
        console.error(`Duration: ${duration}ms`);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${errorMessage}`);
        
        if (error instanceof Error && 'stderr' in error) {
          console.error('\nStderr output:');
          console.error((error as NodeJS.ErrnoException & { stderr?: string }).stderr);
        }
        
        if (error instanceof Error && 'blockExecution' in error) {
          console.error('\nThis error would block tool execution in Claude Code.');
        }
        
        process.exit(1);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });