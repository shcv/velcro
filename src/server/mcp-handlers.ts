import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { configManager } from '../config/index.js';
import { HandlerExecutor } from '../handlers/executor.js';
import { HookQuery } from '../query/index.js';
import { packageManager } from '../packages/manager.js';
import { ClaudeHandlerImporter } from '../config/claude-import.js';
import { HookToolArgs, SettingsToolArgs, PackageToolArgs, MonitorToolArgs, LogToolArgs } from '../types/tool-args.js';
import { HookData, HookType } from '../types/hooks.js';
import { Config } from '../config/index.js';

// Initialize shared components
const handlerExecutor = new HandlerExecutor();

// Create a new MCP server instance
export function createMCPServer(): Server {
  const mcpServer = new Server({
    name: 'velcro',
    version: '0.1.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // List available tools
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'hook',
          description: 'Manage hook handlers. Examples: {"action": "add", "name": "logger", "hooks": ["PreToolUse"], "code": "console.log(hookData)"}, {"action": "list"}, {"action": "test", "name": "logger", "test_data": {"hook_event_name": "PreToolUse", "tool_name": "Read"}}',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['list', 'add', 'remove', 'enable', 'disable', 'test', 'import'], description: 'Action: list (show all), add (create new), remove (delete), enable/disable (toggle), test (run with test data), import (from Claude)' },
              name: { type: 'string', description: 'Handler name (required for add, remove, enable, disable, test)' },
              hooks: { type: 'array', items: { type: 'string' }, description: 'Hook types to handle (required for add), e.g., ["PreToolUse", "PostToolUse"]' },
              type: { type: 'string', enum: ['velcro', 'command', 'script'], default: 'velcro', description: 'Handler type: velcro (JS code), command (shell), or script (file)' },
              code: { type: 'string', description: 'Handler code in JavaScript (required for velcro type). Available: hookData, console, require' },
              command: { type: 'string', description: 'Shell command to execute (required for command type)' },
              script: { type: 'string', description: 'Path to script file (required for script type)' },
              matcher: { type: 'string', description: 'Regex to filter tool names (e.g., "Edit|Write", ".*" for all)' },
              packages: { type: 'array', items: { type: 'string' }, description: 'NPM packages the handler needs (optional, velcro handlers only)' },
              test_data: { type: 'object', description: 'Test hook data object (required for test action)' },
              import_path: { type: 'string', description: 'Path to Claude settings.json (for import action)' }
            },
            required: ['action']
          }
        },
        {
          name: 'config',
          description: 'Manage Velcro configuration. Examples: {"action": "show"}, {"action": "update", "config": {"logging": {"level": "debug"}}}',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['show', 'update'], description: 'Action: show (display current config) or update (modify settings)' },
              settings: { type: 'object', description: 'Settings object to merge with current config (required for update). Can include server, logging, or handlers properties.' }
            },
            required: ['action']
          }
        },
        {
          name: 'package',
          description: 'Execute npm package management commands. Examples: {"command": "install", "packages": ["lodash", "moment"], "handler_name": "my-handler"}, {"command": "list", "scope": "global"}, {"command": "search", "packages": ["date"]}, {"command": "info", "packages": ["axios"]}',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', enum: ['install', 'list', 'search', 'info'], description: 'Command: install (add packages), list (show installed), search (find on npm), info (package details)' },
              packages: { type: 'array', items: { type: 'string' }, description: 'Package names (required for install, search, info). Can specify versions like "lodash@4.17.21"' },
              scope: { type: 'string', enum: ['handler', 'global'], default: 'handler', description: 'Scope: handler (specific to one handler) or global (available to all). Default: handler' },
              handler_name: { type: 'string', description: 'Handler name (required when scope is "handler"). Packages are isolated per handler.' }
            },
            required: ['command']
          }
        },
        {
          name: 'log',
          description: 'Query and analyze hook execution logs. Claude can use this to debug handlers and understand hook patterns. Examples: {"action": "tail", "count": 20}, {"action": "query", "filters": {"hook_type": "PreToolUse", "tool_name": "Write"}}, {"action": "query", "filters": {"start_time": "2024-01-01T00:00:00Z"}}',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['query', 'tail'], default: 'query', description: 'Action: query (search with filters) or tail (show recent hooks)' },
              filters: { 
                type: 'object', 
                properties: {
                  hook_type: { type: 'string', description: 'Filter by hook type (e.g., "PreToolUse", "PostToolUse")' },
                  tool_name: { type: 'string', description: 'Filter by tool name (e.g., "Read", "Write")' },
                  start_time: { type: 'string', description: 'Start time in ISO format' },
                  end_time: { type: 'string', description: 'End time in ISO format' }
                },
                description: 'Filters for query action'
              },
              limit: { type: 'number', default: 100, description: 'Maximum results for query (default: 100)' },
              offset: { type: 'number', default: 0, description: 'Offset for pagination' },
              count: { type: 'number', default: 10, description: 'Number of recent hooks for tail action' }
            }
          }
        },
        {
          name: 'monitor',
          description: 'Monitor handler performance and system health. Claude can use this to identify problematic handlers and optimize performance. Examples: {"type": "stats"}, {"type": "health"}, {"type": "active"}',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['stats', 'health', 'active'], default: 'stats', description: 'Monitor type: stats (handler performance), health (system status), active (currently running)' },
              detailed: { type: 'boolean', default: false, description: 'Include detailed breakdown' },
              handler_name: { type: 'string', description: 'Filter stats for specific handler' }
            }
          }
        }
      ]
    };
  });

  // Handle tool calls
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await handleToolCall(request.params.name, request.params.arguments);
  });

  return mcpServer;
}

// Handle individual tool calls
export async function handleToolCall(name: string, args: unknown): Promise<{content: Array<{type: string; text: string}>}> {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments');
  }
  
  switch (name) {
    case 'hook': {
      const hooksArgs = args as HookToolArgs;
      switch (hooksArgs.action) {
        case 'list': {
          const handlers = configManager.listHandlers();
          return { 
            content: [{
              type: 'text',
              text: handlers.length > 0 
                ? handlers.map(h => {
                    let desc = `${h.name} (${h.type || 'velcro'}, ${h.enabled ? 'enabled' : 'disabled'})`;
                    desc += `\n  Hooks: ${h.hooks.join(', ')}`;
                    if (h.matcher) {
                      desc += `\n  Matcher: ${h.matcher}`;
                    }
                    if (h.type === 'command' && h.command) {
                      desc += `\n  Command: ${h.command}`;
                    }
                    if (h.type === 'script' && h.script) {
                      desc += `\n  Script: ${h.script}`;
                    }
                    return desc;
                  }).join('\n\n')
                : 'No handlers configured'
            }]
          };
        }
          
        case 'add': {
          if (!hooksArgs.name || !hooksArgs.hooks) {
            throw new Error('name and hooks are required for add action');
          }
          const handlerType = hooksArgs.type || 'velcro';
          
          // Validate based on type
          if (handlerType === 'velcro' && !hooksArgs.code) {
            throw new Error('code is required for velcro handlers');
          } else if (handlerType === 'command' && !hooksArgs.command) {
            throw new Error('command is required for command handlers');
          } else if (handlerType === 'script' && !hooksArgs.script) {
            throw new Error('script is required for script handlers');
          }
          
          configManager.addHandler({
            name: hooksArgs.name,
            enabled: true,
            hooks: (hooksArgs.hooks as HookType[]) || [],
            type: handlerType,
            code: hooksArgs.code,
            command: hooksArgs.command,
            script: hooksArgs.script,
            matcher: hooksArgs.matcher,
            packages: hooksArgs.packages || [],
            source: 'velcro',
            managed: true
          });
          return {
            content: [{ type: 'text', text: `Handler ${hooksArgs.name} (${handlerType}) added successfully` }]
          };
        }
          
        case 'remove': {
          if (!hooksArgs.name) {
            throw new Error('name is required for remove action');
          }
          const removed = configManager.removeHandler(hooksArgs.name);
          return {
            content: [{ type: 'text', text: removed ? `Handler ${hooksArgs.name} removed` : `Handler ${hooksArgs.name} not found` }]
          };
        }
          
        case 'enable': {
          if (!hooksArgs.name) {
            throw new Error('name is required for enable action');
          }
          const enabled = configManager.enableHandler(hooksArgs.name);
          return {
            content: [{ type: 'text', text: enabled ? `Handler ${hooksArgs.name} enabled` : `Handler ${hooksArgs.name} not found` }]
          };
        }
          
        case 'disable': {
          if (!hooksArgs.name) {
            throw new Error('name is required for disable action');
          }
          const disabled = configManager.disableHandler(hooksArgs.name);
          return {
            content: [{ type: 'text', text: disabled ? `Handler ${hooksArgs.name} disabled` : `Handler ${hooksArgs.name} not found` }]
          };
        }
          
        case 'test': {
          if (!hooksArgs.name || !hooksArgs.test_data) {
            throw new Error('name and test_data are required for test action');
          }
          const handler = configManager.getHandler(hooksArgs.name);
          if (!handler) {
            return {
              content: [{ type: 'text', text: `Handler ${hooksArgs.name} not found` }]
            };
          }
          try {
            await handlerExecutor.execute(handler, hooksArgs.test_data as HookData || {} as HookData);
            return {
              content: [{ type: 'text', text: `Handler ${hooksArgs.name} executed successfully` }]
            };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: 'text', text: `Handler ${hooksArgs.name} failed: ${errorMessage}` }]
            };
          }
        }
          
        case 'import': {
          try {
            const importedHandlers = ClaudeHandlerImporter.importFromClaudeSettings(hooksArgs.import_path);
            
            if (importedHandlers.length === 0) {
              return {
                content: [{ type: 'text', text: 'No handlers found to import (velcro hooks are skipped)' }]
              };
            }
            
            // Add all handlers
            for (const handler of importedHandlers) {
              configManager.addHandler(handler);
            }
            
            return {
              content: [{ 
                type: 'text', 
                text: `Successfully imported ${importedHandlers.length} handlers:\n${importedHandlers.map(h => `- ${h.name} (${h.type})`).join('\n')}` 
              }]
            };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: 'text', text: `Import failed: ${errorMessage}` }]
            };
          }
        }
          
        default:
          throw new Error(`Unknown action: ${hooksArgs.action}`);
      }
    }
    
    case 'config': {
      const settingsArgs = args as SettingsToolArgs;
      if (settingsArgs.action === 'show') {
        const config = configManager.getConfig();
        return {
          content: [{ type: 'text', text: JSON.stringify(config, null, 2) }]
        };
      } else if (settingsArgs.action === 'update') {
        if (!settingsArgs.settings) {
          throw new Error('settings parameter is required for update action');
        }
        configManager.updateConfig(settingsArgs.settings as Partial<Config>);
        return {
          content: [{ type: 'text', text: 'Configuration updated successfully' }]
        };
      }
      throw new Error(`Unknown action: ${settingsArgs.action}`);
    }
    
    case 'package': {
      const packageArgs = args as PackageToolArgs;
      
      switch (packageArgs.command) {
        case 'install': {
          if (!packageArgs.packages || packageArgs.packages.length === 0) {
            throw new Error('packages are required for install command');
          }
          const scope = packageArgs.scope || 'handler';
          if (scope === 'handler' && !packageArgs.handler_name) {
            throw new Error('handler_name is required when scope is "handler"');
          }
          try {
            await packageManager.install(
              packageArgs.packages, 
              scope,
              scope === 'handler' ? packageArgs.handler_name : undefined
            );
            const scopeText = scope === 'handler' 
              ? `handler '${packageArgs.handler_name}'` 
              : 'global scope';
            return {
              content: [{ 
                type: 'text', 
                text: `Successfully installed packages: ${packageArgs.packages.join(', ')} for ${scopeText}` 
              }]
            };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: 'text', text: `Failed to install packages: ${errorMessage}` }]
            };
          }
        }
          
        case 'list': {
          const listScope = packageArgs.scope || 'handler';
          if (listScope === 'handler' && !packageArgs.handler_name) {
            // List all handlers and their packages
            const handlers = configManager.listHandlers();
            const allPackages: string[] = [];
            
            for (const handler of handlers) {
              const packages = packageManager.list('handler', handler.name);
              if (packages.length > 0) {
                allPackages.push(`\nHandler: ${handler.name}`);
                packages.forEach(pkg => {
                  allPackages.push(`  ${pkg.name}@${pkg.version}`);
                });
              }
            }
            
            if (allPackages.length === 0) {
              return {
                content: [{ type: 'text', text: 'No packages installed for any handler' }]
              };
            }
            
            return {
              content: [{ type: 'text', text: `Installed packages by handler:${allPackages.join('\n')}` }]
            };
          }
          
          const installedPackages = packageManager.list(
            listScope,
            listScope === 'handler' ? packageArgs.handler_name : undefined
          );
          
          if (installedPackages.length === 0) {
            const scopeText = listScope === 'handler' 
              ? `handler '${packageArgs.handler_name}'` 
              : 'global scope';
            return {
              content: [{ type: 'text', text: `No packages installed for ${scopeText}` }]
            };
          }
          
          const packageList = installedPackages
            .map(pkg => `${pkg.name}@${pkg.version}`)
            .join('\n');
          const scopeText = listScope === 'handler' 
            ? `handler '${packageArgs.handler_name}'` 
            : 'global scope';
          return {
            content: [{ type: 'text', text: `Installed packages for ${scopeText}:\n${packageList}` }]
          };
        }
          
        case 'search': {
          if (!packageArgs.packages || packageArgs.packages.length === 0) {
            throw new Error('package name is required for search command');
          }
          try {
            const searchResults = await packageManager.search(packageArgs.packages[0]);
            if (searchResults.length === 0) {
              return {
                content: [{ type: 'text', text: `No packages found matching: ${packageArgs.packages[0]}` }]
              };
            }
            const results = searchResults
              .map(pkg => `${pkg.name}@${pkg.version} - ${pkg.description || 'No description'}`)
              .join('\n');
            return {
              content: [{ type: 'text', text: `Search results for "${packageArgs.packages[0]}":\n${results}` }]
            };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: 'text', text: `Search failed: ${errorMessage}` }]
            };
          }
        }
          
        case 'info': {
          if (!packageArgs.packages || packageArgs.packages.length === 0) {
            throw new Error('package name is required for info command');
          }
          try {
            const info = await packageManager.info(packageArgs.packages[0]);
            if (!info) {
              return {
                content: [{ type: 'text', text: `Package not found: ${packageArgs.packages[0]}` }]
              };
            }
            const deps = info.dependencies 
              ? `\nDependencies:\n${Object.entries(info.dependencies).map(([name, version]) => `  ${name}: ${version}`).join('\n')}`
              : '';
            return {
              content: [{ 
                type: 'text', 
                text: `Package: ${info.name}@${info.version}\nDescription: ${info.description || 'No description'}${deps}` 
              }]
            };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: 'text', text: `Failed to get package info: ${errorMessage}` }]
            };
          }
        }
          
        default:
          throw new Error(`Unknown command: ${packageArgs.command}`);
      }
    }
    
    case 'monitor': {
      const monitorArgs = args as MonitorToolArgs;
      const type = monitorArgs.type || 'stats';
      
      switch (type) {
        case 'stats': {
          const { statsManager } = await import('../handlers/stats.js');
          
          if (monitorArgs.handler_name) {
            // Get stats for specific handler
            const stats = statsManager.getStats(monitorArgs.handler_name);
            if (!stats) {
              return {
                content: [{ type: 'text', text: `No statistics found for handler: ${monitorArgs.handler_name}` }]
              };
            }
            
            const formatted = `Handler: ${monitorArgs.handler_name}
Executions: ${stats.executions}
Success Rate: ${stats.successRate.toFixed(1)}%
Average Duration: ${stats.avgDuration.toFixed(0)}ms
Total Duration: ${stats.totalDuration}ms
Failures: ${stats.failures}
Last Execution: ${stats.lastExecution || 'Never'}
${stats.lastError ? `Last Error: ${stats.lastError}` : ''}`;
            
            return {
              content: [{ type: 'text', text: formatted }]
            };
          } else {
            // Get stats for all handlers
            const allStats = statsManager.getAllStats();
            
            if (allStats.length === 0) {
              return {
                content: [{ type: 'text', text: 'No handler statistics available yet' }]
              };
            }
            
            const formatted = allStats
              .sort((a, b) => b.stats.executions - a.stats.executions)
              .map(({ handlerName, stats }) => {
                const line = `${handlerName}: ${stats.executions} runs, ${stats.successRate.toFixed(1)}% success, ${stats.avgDuration.toFixed(0)}ms avg`;
                if (monitorArgs.detailed) {
                  return line + `\n  Failures: ${stats.failures}, Total time: ${stats.totalDuration}ms` +
                    (stats.lastError ? `\n  Last error: ${stats.lastError}` : '');
                }
                return line;
              })
              .join('\n');
            
            return {
              content: [{ 
                type: 'text', 
                text: `Handler Performance Statistics:\n\n${formatted}` 
              }]
            };
          }
        }
        
        case 'health': {
          const config = configManager.getConfig();
          const { logger } = await import('../logging/logger.js');
          const activeHandlers = config.handlers.filter(h => h.enabled);
          
          const health = {
            status: 'healthy',
            server: {
              host: config.server.host,
              port: config.server.port
            },
            logging: {
              level: config.logging.level,
              directory: logger.getLogDirectory()
            },
            handlers: {
              total: config.handlers.length,
              active: activeHandlers.length,
              byType: {
                velcro: config.handlers.filter(h => h.type === 'velcro').length,
                command: config.handlers.filter(h => h.type === 'command').length,
                script: config.handlers.filter(h => h.type === 'script').length
              }
            }
          };
          
          return {
            content: [{ 
              type: 'text', 
              text: `System Health:\n${JSON.stringify(health, null, 2)}` 
            }]
          };
        }
        
        case 'active': {
          // For now, we don't track actively running handlers
          // This could be enhanced to track async handler execution
          return {
            content: [{ 
              type: 'text', 
              text: 'Active handler tracking not yet implemented.\nAll handlers execute synchronously and complete quickly.' 
            }]
          };
        }
        
        default:
          throw new Error(`Unknown monitor type: ${type}`);
      }
    }
    
    case 'log': {
      const logArgs = args as LogToolArgs;
      const action = logArgs.action || 'query';
      
      switch (action) {
        case 'query': {
          const filters = logArgs.filters || {};
          const limit = logArgs.limit || 100;
          
          // Query hook logs
          const hookQuery = new HookQuery();
          const results = await hookQuery.query({
            hookTypes: filters.hook_type ? [filters.hook_type] : undefined,
            tools: filters.tool_name ? [filters.tool_name] : undefined,
            startTime: filters.start_time ? new Date(filters.start_time) : undefined,
            endTime: filters.end_time ? new Date(filters.end_time) : undefined,
            limit
          });
          
          if (results.length === 0) {
            return {
              content: [{ type: 'text', text: 'No hooks found matching the criteria' }]
            };
          }
          
          // Format results
          const formatted = results.map(hook => {
            const hookWithTime = hook as HookData & { timestamp: string | number; tool_name?: string };
            const time = new Date(hookWithTime.timestamp).toLocaleString();
            const tool = hookWithTime.tool_name ? ` - Tool: ${hookWithTime.tool_name}` : '';
            return `[${time}] ${hook.hook_event_name}${tool}`;
          }).join('\n');
          
          return {
            content: [{ 
              type: 'text', 
              text: `Found ${results.length} hooks:\n\n${formatted}` 
            }]
          };
        }
        
        case 'tail': {
          // Return the last N hooks
          const count = logArgs.count || 10;
          const hookQuery = new HookQuery();
          const results = await hookQuery.query({ limit: count });
          
          if (results.length === 0) {
            return {
              content: [{ type: 'text', text: 'No recent hooks found' }]
            };
          }
          
          const formatted = results.map(hook => {
            const hookWithTime = hook as HookData & { timestamp: string | number; tool_name?: string };
            const time = new Date(hookWithTime.timestamp).toLocaleString();
            const tool = hookWithTime.tool_name ? ` - Tool: ${hookWithTime.tool_name}` : '';
            const details = 'tool_input' in hookWithTime && hookWithTime.tool_input ? `\n  Input: ${JSON.stringify(hookWithTime.tool_input).substring(0, 100)}...` : '';
            return `[${time}] ${hook.hook_event_name}${tool}${details}`;
          }).join('\n\n');
          
          return {
            content: [{ 
              type: 'text', 
              text: `Last ${results.length} hooks:\n\n${formatted}` 
            }]
          };
        }
        
        default:
          throw new Error(`Unknown logs action: ${action}`);
      }
    }
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}