import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { HookData } from '../types/hooks.js';
import { logger } from '../logging/logger.js';

export interface QueryOptions {
  hookTypes?: string[];
  tools?: string[];
  sessions?: string[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

export class HookQuery {
  private logDir: string;
  
  constructor() {
    this.logDir = logger.getLogDirectory();
  }
  
  async query(options: QueryOptions): Promise<HookData[]> {
    const results: HookData[] = [];
    const limit = options.limit || 100;
    
    if (!existsSync(this.logDir)) {
      return results;
    }
    
    // Get all log files
    const files = readdirSync(this.logDir)
      .filter(f => f.startsWith('hooks-') && f.endsWith('.jsonl'))
      .sort()
      .reverse(); // Most recent first
    
    // Collect all matching hooks from all files
    const allHooks: (HookData & { timestamp: string })[] = [];
    
    for (const file of files) {
      const filePath = join(this.logDir, file);
      const lines = readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const hook = JSON.parse(line) as HookData & { timestamp: string };
          
          // Apply filters
          if (options.hookTypes && !options.hookTypes.includes(hook.hook_event_name)) {
            continue;
          }
          
          if (options.tools && 'tool_name' in hook && !options.tools.includes(hook.tool_name)) {
            continue;
          }
          
          if (options.sessions && !options.sessions.includes(hook.session_id)) {
            continue;
          }
          
          if (options.startTime && new Date(hook.timestamp) < options.startTime) {
            continue;
          }
          
          if (options.endTime && new Date(hook.timestamp) > options.endTime) {
            continue;
          }
          
          allHooks.push(hook);
        } catch (_error) {
          console.error('Failed to parse hook:', _error);
        }
      }
    }
    
    // Sort by timestamp descending (most recent first)
    allHooks.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
    
    // Return limited results
    return allHooks.slice(0, limit);
  }
  
  formatSummary(hooks: HookData[]): string {
    const summary = {
      total: hooks.length,
      byType: {} as Record<string, number>,
      byTool: {} as Record<string, number>,
      sessions: new Set<string>()
    };
    
    for (const hook of hooks) {
      summary.byType[hook.hook_event_name] = (summary.byType[hook.hook_event_name] || 0) + 1;
      
      if ('tool_name' in hook) {
        summary.byTool[hook.tool_name] = (summary.byTool[hook.tool_name] || 0) + 1;
      }
      
      summary.sessions.add(hook.session_id);
    }
    
    return `Hook Summary:
Total hooks: ${summary.total}
Unique sessions: ${summary.sessions.size}

By hook type:
${Object.entries(summary.byType).map(([type, count]) => `  ${type}: ${count}`).join('\n')}

By tool:
${Object.entries(summary.byTool).map(([tool, count]) => `  ${tool}: ${count}`).join('\n')}`;
  }
  
  formatTimeline(hooks: HookData[]): string {
    return hooks.map(hook => {
      const timestamp = (hook as HookData & { timestamp: string }).timestamp;
      let line = `[${timestamp}] ${hook.hook_event_name}`;
      
      if ('tool_name' in hook) {
        line += ` - ${hook.tool_name}`;
      }
      
      if ('message' in hook) {
        line += `: ${hook.message}`;
      }
      
      if ('prompt' in hook) {
        line += `: ${hook.prompt.substring(0, 50)}...`;
      }
      
      return line;
    }).join('\n');
  }
}