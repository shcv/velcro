import { HookType, HookData } from './hooks.js';

export interface Handler {
  id: string;
  name: string;              // Must be unique, used as filename
  description?: string;
  hookTypes: HookType[];
  priority: number;          // Execution order (lower = earlier)
  enabled: boolean;
  code: string;              // JavaScript function as string
  timeout?: number;          // Override default timeout
  created: Date;
  updated: Date;
  stats: HandlerStats;
}

export interface HandlerStats {
  executions: number;
  failures: number;
  avgDuration: number;
  lastExecution?: Date;
  lastError?: string;
}

export interface HandlerContext {
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
  storage: Map<string, unknown>;  // Simple KV store for now
  fetch: typeof fetch;        // Sandboxed fetch
  emit: (eventName: string, data: unknown) => void;
}

export type HandlerFunction = (event: HookData, context: HandlerContext) => Promise<HandlerResult>;

export interface HandlerResult {
  // For PreToolUse hooks
  allow?: boolean;
  reason?: string;
  
  // For all hooks
  success?: boolean;
  data?: unknown;
  error?: string;
}