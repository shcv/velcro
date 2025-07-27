import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import { HookData } from '../types/hooks.js';
import { configManager } from '../config/index.js';
import { HookExecutionResult } from '../handlers/executor.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

export interface HookLogEntry {
  timestamp: string;
  hook_event_name: string;
  [key: string]: unknown; // Allow additional hook data fields
}

export interface HookExecutionLogEntry {
  timestamp: string;
  hook_event_name: string;
  session_id: string;
  execution_results: HookExecutionResult[];
  summary: {
    total_handlers: number;
    successful: number;
    failed: number;
    blocked: boolean;
    blocking_handler?: string;
  };
}

class Logger {
  private logDir: string;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor() {
    // Use configured log directory
    const config = configManager.getConfig();
    
    if (config.logging.logDir) {
      // If logDir is absolute, use it directly
      if (config.logging.logDir.startsWith('/') || config.logging.logDir.match(/^[A-Za-z]:\\/)) {
        this.logDir = config.logging.logDir;
      } else {
        // Otherwise, treat it as relative to the data directory
        this.logDir = join(configManager.getDataDirectory(), config.logging.logDir);
      }
    } else {
      // Default to logs subdirectory in data directory
      this.logDir = join(configManager.getDataDirectory(), 'logs');
    }
    
    mkdirSync(this.logDir, { recursive: true });
    
    // Clean up old logs on startup
    this.rotateLogsIfNeeded();
  }

  private shouldLog(level: LogLevel): boolean {
    const config = configManager.getConfig();
    const configuredLevel = config.logging.level;
    return this.logLevels[level] >= this.logLevels[configuredLevel];
  }

  private getLogFile(prefix: string = 'app'): string {
    const today = new Date().toISOString().split('T')[0];
    const filename = `${prefix}-${today}.jsonl`;
    const filepath = join(this.logDir, filename);
    
    // Check if we need to rotate based on size
    this.checkFileSize(filepath);
    
    return filepath;
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMG]?B)?$/i);
    if (!match) {
      return 10 * 1024 * 1024; // Default 10MB
    }
    
    const num = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    
    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };
    
    return num * (multipliers[unit] || 1);
  }

  private checkFileSize(filepath: string): void {
    try {
      const stats = statSync(filepath);
      const config = configManager.getConfig();
      const maxSize = this.parseSize(config.logging.maxSize);
      
      if (stats.size > maxSize) {
        // Rotate the file by renaming it with a timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = filepath.replace('.jsonl', `-${timestamp}.jsonl`);
        
        // Rename the current file
        // Use the imported renameSync
        renameSync(filepath, rotatedPath);
        
        this.info(`Rotated log file ${filepath} to ${rotatedPath} (size: ${stats.size} bytes)`);
      }
    } catch (_error) {
      // File doesn't exist yet, that's fine
    }
  }

  private rotateLogsIfNeeded(): void {
    try {
      const config = configManager.getConfig();
      const maxFiles = config.logging.maxFiles;
      
      // Get all log files
      const files = readdirSync(this.logDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: join(this.logDir, f),
          stats: statSync(join(this.logDir, f))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
      
      // Keep only the most recent maxFiles
      if (files.length > maxFiles) {
        const filesToDelete = files.slice(maxFiles);
        
        for (const file of filesToDelete) {
          unlinkSync(file.path);
          this.info(`Deleted old log file: ${file.name}`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error('Failed to rotate logs', { error: errorMessage });
    }
  }

  log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };

    const logFile = this.getLogFile();
    appendFileSync(logFile, JSON.stringify(entry) + '\n');

    // Also log to console if in debug mode (but not when running inside a velcro handler)
    if (configManager.getConfig().logging.level === 'debug' && !process.env.HANDLER_NAME) {
      const prefix = `[${level.toUpperCase()}]`;
      if (data) {
        console.error(prefix, message, data);
      } else {
        console.error(prefix, message);
      }
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  logHook(hookData: HookData): void {
    const entry: HookLogEntry = {
      timestamp: new Date().toISOString(),
      ...hookData
    };

    const logFile = this.getLogFile('hooks');
    appendFileSync(logFile, JSON.stringify(entry) + '\n');
    
    // Don't output to console for hook logging to avoid polluting hook responses
    // The hook data is already logged to file for debugging
  }

  logHookExecution(hookData: HookData, results: HookExecutionResult[]): void {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const blocked = results.some(r => r.blockExecution);
    const blockingHandler = results.find(r => r.blockExecution)?.handler;

    const entry: HookExecutionLogEntry = {
      timestamp: new Date().toISOString(),
      hook_event_name: hookData.hook_event_name,
      session_id: hookData.session_id,
      execution_results: results,
      summary: {
        total_handlers: results.length,
        successful,
        failed,
        blocked,
        blocking_handler: blockingHandler
      }
    };

    const logFile = this.getLogFile('hook-executions');
    appendFileSync(logFile, JSON.stringify(entry) + '\n');
    
    this.debug(`Hook execution logged: ${hookData.hook_event_name}`, {
      handlers: results.length,
      successful,
      failed,
      blocked,
      outputs: results.filter(r => r.output).map(r => `${r.handler}: ${r.output}`)
    });
  }

  getLogDirectory(): string {
    return this.logDir;
  }

  rotateLogs(): void {
    this.rotateLogsIfNeeded();
  }

  getLogStats(): { totalFiles: number; totalSize: number; oldestFile?: string; newestFile?: string } {
    try {
      const files = readdirSync(this.logDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: join(this.logDir, f),
          stats: statSync(join(this.logDir, f))
        }))
        .sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());
      
      const totalSize = files.reduce((sum, f) => sum + f.stats.size, 0);
      
      return {
        totalFiles: files.length,
        totalSize,
        oldestFile: files[0]?.name,
        newestFile: files[files.length - 1]?.name
      };
    } catch (_error) {
      return { totalFiles: 0, totalSize: 0 };
    }
  }
}

// Export singleton instance
export const logger = new Logger();