import { Command } from 'commander';
import { HookQuery } from '../../query/index.js';
import { logger } from '../../logging/logger.js';
import { configManager } from '../../config/index.js';
import { HookData } from '../../types/hooks.js';

export const logCommand = new Command('log')
  .description('Query and analyze hook execution logs')
  .addCommand(
    new Command('query')
      .description('Query logs with filters')
      .option('-t, --type <hook>', 'Filter by hook type (e.g., PreToolUse)')
      .option('-T, --tool <name>', 'Filter by tool name (e.g., Read, Write)')
      .option('-s, --start <time>', 'Start time (ISO format or relative like "1h", "30m")')
      .option('-e, --end <time>', 'End time (ISO format)')
      .option('-l, --limit <n>', 'Maximum results', '100')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const hookQuery = new HookQuery();
          
          // Parse relative times
          const parseTime = (timeStr: string | undefined): Date | undefined => {
            if (!timeStr) return undefined;
            
            // Check if it's a relative time
            const relativeMatch = timeStr.match(/^(\d+)([mhd])$/);
            if (relativeMatch) {
              const amount = parseInt(relativeMatch[1]);
              const unit = relativeMatch[2];
              const now = new Date();
              
              switch (unit) {
                case 'm':
                  return new Date(now.getTime() - amount * 60 * 1000);
                case 'h':
                  return new Date(now.getTime() - amount * 60 * 60 * 1000);
                case 'd':
                  return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
              }
            }
            
            return new Date(timeStr);
          };
          
          const results = await hookQuery.query({
            hookTypes: options.type ? [options.type] : undefined,
            tools: options.tool ? [options.tool] : undefined,
            startTime: parseTime(options.start),
            endTime: parseTime(options.end),
            limit: parseInt(options.limit)
          });
          
          if (results.length === 0) {
            console.log('No hooks found matching the criteria');
            return;
          }
          
          if (options.json) {
            console.log(JSON.stringify(results, null, 2));
          } else {
            console.log(`Found ${results.length} hooks:\n`);
            results.forEach(hook => {
              const hookWithTime = hook as HookData & { timestamp: string; tool_name?: string };
              const time = new Date(hookWithTime.timestamp).toLocaleString();
              const tool = hookWithTime.tool_name ? ` - Tool: ${hookWithTime.tool_name}` : '';
              console.log(`[${time}] ${hook.hook_event_name}${tool}`);
              
              // Show additional details for some hooks
              if ('tool_input' in hookWithTime && hookWithTime.tool_input && options.verbose) {
                const input = JSON.stringify(hookWithTime.tool_input);
                console.log(`  Input: ${input.substring(0, 100)}${input.length > 100 ? '...' : ''}`);
              }
            });
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error querying logs: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('tail')
      .description('Show recent hooks')
      .option('-n, --count <n>', 'Number of recent hooks', '10')
      .option('-f, --follow', 'Follow log output (not implemented yet)')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const hookQuery = new HookQuery();
          const results = await hookQuery.query({
            limit: parseInt(options.count)
          });
          
          if (results.length === 0) {
            console.log('No recent hooks found');
            return;
          }
          
          if (options.json) {
            console.log(JSON.stringify(results, null, 2));
          } else {
            console.log(`Last ${results.length} hooks:\n`);
            results.forEach(hook => {
              const hookWithTime = hook as HookData & { timestamp: string; tool_name?: string };
              const time = new Date(hookWithTime.timestamp).toLocaleString();
              const tool = hookWithTime.tool_name ? ` - Tool: ${hookWithTime.tool_name}` : '';
              console.log(`[${time}] ${hook.hook_event_name}${tool}`);
              
              if ('tool_input' in hookWithTime && hookWithTime.tool_input) {
                const input = JSON.stringify(hookWithTime.tool_input);
                console.log(`  Input: ${input.substring(0, 100)}${input.length > 100 ? '...' : ''}`);
              }
              console.log();
            });
          }
          
          if (options.follow) {
            console.log('\nNote: --follow is not implemented yet');
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error tailing logs: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('path')
      .description('Show log directory path')
      .action(() => {
        console.log(logger.getLogDirectory());
      })
  )
  .addCommand(
    new Command('level')
      .description('Get or set log level')
      .argument('[level]', 'Log level (debug, info, warn, error)')
      .action((level) => {
        if (level) {
          // Set log level
          try {
            const config = configManager.getConfig();
            config.logging.level = level as 'debug' | 'info' | 'warn' | 'error';
            configManager.updateConfig(config);
            console.log(`Log level set to: ${level}`);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error setting log level: ${errorMessage}`);
            process.exit(1);
          }
        } else {
          // Get log level
          const config = configManager.getConfig();
          console.log(config.logging.level);
        }
      })
  )
  .addCommand(
    new Command('rotate')
      .description('Rotate log files based on configured limits')
      .option('--dry-run', 'Show what would be deleted without actually deleting')
      .action((options) => {
        try {
          const stats = logger.getLogStats();
          console.log('Current log statistics:');
          console.log(`  Total files: ${stats.totalFiles}`);
          console.log(`  Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
          if (stats.oldestFile) {
            console.log(`  Oldest file: ${stats.oldestFile}`);
            console.log(`  Newest file: ${stats.newestFile}`);
          }
          
          if (!options.dryRun) {
            logger.rotateLogs();
            console.log('\nLog rotation complete');
            
            const newStats = logger.getLogStats();
            if (newStats.totalFiles < stats.totalFiles) {
              console.log(`Deleted ${stats.totalFiles - newStats.totalFiles} old log files`);
            }
          } else {
            const config = configManager.getConfig();
            console.log(`\nConfiguration: Keep ${config.logging.maxFiles} files, max ${config.logging.maxSize} per file`);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error rotating logs: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('stats')
      .description('Show log file statistics')
      .action(() => {
        try {
          const stats = logger.getLogStats();
          const config = configManager.getConfig();
          
          console.log('Log Statistics:');
          console.log(`  Directory: ${logger.getLogDirectory()}`);
          console.log(`  Total files: ${stats.totalFiles}`);
          console.log(`  Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
          if (stats.oldestFile) {
            console.log(`  Oldest file: ${stats.oldestFile}`);
            console.log(`  Newest file: ${stats.newestFile}`);
          }
          console.log('\nConfiguration:');
          console.log(`  Log level: ${config.logging.level}`);
          console.log(`  Max files: ${config.logging.maxFiles}`);
          console.log(`  Max size per file: ${config.logging.maxSize}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error getting log stats: ${errorMessage}`);
          process.exit(1);
        }
      })
  );