import { Command } from 'commander';
import { statsManager } from '../../handlers/stats.js';
import { configManager } from '../../config/index.js';
import { logger } from '../../logging/logger.js';

export const monitorCommand = new Command('monitor')
  .description('Monitor handler performance and system health')
  .addCommand(
    new Command('stats')
      .description('Show handler performance statistics')
      .option('-h, --handler <name>', 'Show stats for specific handler')
      .option('-d, --detailed', 'Include detailed breakdown')
      .option('--json', 'Output as JSON')
      .action((options) => {
        if (options.handler) {
          // Get stats for specific handler
          const stats = statsManager.getStats(options.handler);
          
          if (!stats) {
            console.log(`No statistics found for handler: ${options.handler}`);
            return;
          }
          
          if (options.json) {
            console.log(JSON.stringify({ handler: options.handler, stats }, null, 2));
          } else {
            console.log(`Handler: ${options.handler}`);
            console.log(`Executions: ${stats.executions}`);
            console.log(`Success Rate: ${stats.successRate.toFixed(1)}%`);
            console.log(`Average Duration: ${stats.avgDuration.toFixed(0)}ms`);
            console.log(`Total Duration: ${stats.totalDuration}ms`);
            console.log(`Failures: ${stats.failures}`);
            console.log(`Last Execution: ${stats.lastExecution || 'Never'}`);
            if (stats.lastError) {
              console.log(`Last Error: ${stats.lastError}`);
            }
          }
        } else {
          // Get stats for all handlers
          const allStats = statsManager.getAllStats();
          
          if (allStats.length === 0) {
            console.log('No handler statistics available yet');
            return;
          }
          
          if (options.json) {
            console.log(JSON.stringify(allStats, null, 2));
          } else {
            console.log('Handler Performance Statistics:\n');
            
            allStats
              .sort((a, b) => b.stats.executions - a.stats.executions)
              .forEach(({ handlerName, stats }) => {
                console.log(`${handlerName}:`);
                console.log(`  Runs: ${stats.executions}, Success: ${stats.successRate.toFixed(1)}%, Avg: ${stats.avgDuration.toFixed(0)}ms`);
                
                if (options.detailed) {
                  console.log(`  Failures: ${stats.failures}, Total time: ${stats.totalDuration}ms`);
                  if (stats.lastError) {
                    console.log(`  Last error: ${stats.lastError}`);
                  }
                }
                console.log();
              });
          }
        }
      })
  )
  .addCommand(
    new Command('health')
      .description('Show system health status')
      .option('--json', 'Output as JSON')
      .action((options) => {
        const config = configManager.getConfig();
        const activeHandlers = config.handlers.filter(h => h.enabled);
        
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          server: {
            host: config.server.host,
            port: config.server.port
          },
          logging: {
            level: config.logging.level,
            directory: logger.getLogDirectory()
          },
          data: {
            directory: configManager.getDataDirectory()
          },
          handlers: {
            total: config.handlers.length,
            active: activeHandlers.length,
            disabled: config.handlers.length - activeHandlers.length,
            byType: {
              velcro: config.handlers.filter(h => h.type === 'velcro').length,
              command: config.handlers.filter(h => h.type === 'command').length,
              script: config.handlers.filter(h => h.type === 'script').length
            }
          }
        };
        
        if (options.json) {
          console.log(JSON.stringify(health, null, 2));
        } else {
          console.log('System Health Check\n');
          console.log(`Status: ${health.status}`);
          console.log(`Time: ${health.timestamp}`);
          console.log('\nServer:');
          console.log(`  Endpoint: http://${health.server.host}:${health.server.port}`);
          console.log('\nLogging:');
          console.log(`  Level: ${health.logging.level}`);
          console.log(`  Directory: ${health.logging.directory}`);
          console.log('\nData:');
          console.log(`  Directory: ${health.data.directory}`);
          console.log('\nHandlers:');
          console.log(`  Total: ${health.handlers.total}`);
          console.log(`  Active: ${health.handlers.active}`);
          console.log(`  Disabled: ${health.handlers.disabled}`);
          console.log(`  Types: velcro(${health.handlers.byType.velcro}), command(${health.handlers.byType.command}), script(${health.handlers.byType.script})`);
        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('Reset handler statistics')
      .argument('[handler]', 'Handler name (or all if not specified)')
      .option('-y, --yes', 'Skip confirmation')
      .action(async (handler, options) => {
        if (!options.yes) {
          const target = handler ? `handler '${handler}'` : 'all handlers';
          console.log(`This will reset statistics for ${target}.`);
          console.log('Use --yes to confirm.');
          return;
        }
        
        if (handler) {
          statsManager.resetStats(handler);
          console.log(`Statistics reset for handler '${handler}'`);
        } else {
          statsManager.resetStats();
          console.log('All handler statistics reset');
        }
      })
  );