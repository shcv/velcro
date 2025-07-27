import { Handler } from '../config/index.js';
import { EXIT_CODE } from '../constants.js';
import { HookData, PreToolUseHookData, PostToolUseHookData } from '../types/hooks.js';
import { packageManager } from '../packages/manager.js';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { logger } from '../logging/logger.js';
import { statsManager } from './stats.js';

interface CcguardResponse {
  decision?: string;
  reason?: string;
}

// Result type matching Claude Code's hook result structure
export interface HookExecutionResult {
  handler: string;
  success: boolean;
  output?: string;
  stderr?: string;
  exitCode?: number;
  response?: unknown; // Parsed JSON response
  blockExecution?: boolean;
  error?: string;
  duration: number;
}

export class HandlerExecutor {
  async execute(handler: Handler, hookData: HookData): Promise<HookExecutionResult> {
    const startTime = Date.now();
    const result: HookExecutionResult = {
      handler: handler.name,
      success: false,
      duration: 0
    };
    
    try {
      // Check if handler should run based on matcher
      if (handler.matcher && !this.matchesFilter(handler.matcher, hookData)) {
        logger.debug(`Handler ${handler.name} skipped due to matcher`, {
          matcher: handler.matcher,
          hook: hookData.hook_event_name,
          tool: 'tool_name' in hookData ? (hookData as PreToolUseHookData | PostToolUseHookData).tool_name : undefined
        });
        result.success = true;
        return result;
      }
      
      logger.debug(`Executing ${handler.type} handler: ${handler.name}`);
      
      switch (handler.type) {
        case 'velcro':
          return await this.executeVelcroHandler(handler, hookData, result);
        case 'command':
          return await this.executeCommandHandler(handler, hookData, result);
        case 'script':
          return await this.executeScriptHandler(handler, hookData, result);
        case 'function':
          return await this.executeFunctionHandler(handler, hookData, result);
        case 'external':
          return await this.executeExternalHandler(handler, hookData, result);
        default:
          throw new Error(`Unknown handler type: ${handler.type}`);
      }
    } catch (err: unknown) {
      result.error = err instanceof Error ? err.message : String(err);
      result.success = false;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      logger.error(`Handler ${handler.name} execution failed`, { 
        error: errorMessage,
        stack: errorStack 
      });
      
      // Preserve blockExecution flag
      if (err instanceof Error && 'blockExecution' in err) {
        result.blockExecution = true;
        result.stderr = (err as any).stderr || errorMessage;
      }
      
      return result;
    } finally {
      // Record execution stats
      result.duration = Date.now() - startTime;
      statsManager.recordExecution(handler.name, result.duration, result.success, result.error);
    }
  }
  
  private matchesFilter(matcher: string, hookData: HookData): boolean {
    // For tool-related hooks, match against tool name
    if ('tool_name' in hookData && hookData.tool_name) {
      // Handle wildcard
      if (matcher === '*' || !matcher) {
        return true;
      }
      
      try {
        const regex = new RegExp(matcher);
        return regex.test(hookData.tool_name);
      } catch (error) {
        console.error(`Invalid matcher regex: ${matcher}`, error);
        return true; // Default to running if regex is invalid
      }
    }
    
    // For non-tool hooks, matcher of "*" or empty matches all
    return !matcher || matcher === '*';
  }
  
  private async executeVelcroHandler(handler: Handler, hookData: HookData, result: HookExecutionResult): Promise<HookExecutionResult> {
    if (!handler.code) {
      throw new Error(`Velcro handler ${handler.name} has no code`);
    }
    
    // Build package paths map
    const packagePaths: Record<string, string> = {};
    
    // Add handler-specific packages
    const handlerPackages = packageManager.list('handler', handler.name);
    for (const pkg of handlerPackages) {
      const path = packageManager.getPackagePath(pkg.name, 'handler', handler.name);
      if (path) packagePaths[pkg.name] = path;
    }
    
    // Add global packages
    const globalPackages = packageManager.list('global');
    for (const pkg of globalPackages) {
      if (!packagePaths[pkg.name]) {
        const path = packageManager.getPackagePath(pkg.name, 'global');
        if (path) packagePaths[pkg.name] = path;
      }
    }
    
    // Run handler in isolated process
    const runnerPath = new URL('./velcro-runner.js', import.meta.url).pathname;
    
    const env = {
      ...process.env,
      HANDLER_NAME: handler.name,
      HANDLER_CODE: handler.code,
      PACKAGE_PATHS: JSON.stringify(packagePaths)
    };
    
    const child = spawn('node', [runnerPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Capture output
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Send hook data to stdin
    child.stdin.write(JSON.stringify(hookData));
    child.stdin.end();
    
    // Wait for completion
    return new Promise<HookExecutionResult>((resolve) => {
      child.on('exit', (code) => {
        result.exitCode = code || 0;
        result.output = stdout.trim();
        result.stderr = stderr.trim();
        
        if (code === EXIT_CODE.SUCCESS || code === null) {
          result.success = true;
        } else if (code === EXIT_CODE.BLOCK) {
          result.blockExecution = true;
          result.success = false;
        } else {
          result.success = false;
        }
        
        resolve(result);
      });
      
      child.on('error', (err) => {
        result.error = err.message;
        result.success = false;
        resolve(result);
      });
    });
  }
  
  private async executeCommandHandler(handler: Handler, hookData: HookData, result: HookExecutionResult): Promise<HookExecutionResult> {
    if (!handler.command) {
      throw new Error(`Command handler ${handler.name} has no command`);
    }
    
    // Prepare environment variables
    const env = { ...process.env };
    
    // Add Claude-compatible environment variables
    env.CLAUDE_PROJECT_DIR = process.cwd();
    
    // Add hook data as JSON to stdin
    const hookDataJson = JSON.stringify(hookData);
    
    // Execute command
    const child = spawn('sh', ['-c', handler.command], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Capture output
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Send hook data to stdin
    child.stdin.write(hookDataJson);
    child.stdin.end();
    
    // Wait for completion and handle exit codes
    return new Promise<HookExecutionResult>((resolve) => {
      child.on('exit', (code) => {
        result.exitCode = code || 0;
        result.output = stdout.trim();
        result.stderr = stderr.trim();
        
        // Try to parse JSON response
        if (result.output && result.output.startsWith('{')) {
          try {
            result.response = JSON.parse(result.output);
            
            // Handle ccguard-style responses
            if (result.response && typeof result.response === 'object') {
              const response = result.response as CcguardResponse;
              if (response.decision === 'block') {
                result.blockExecution = true;
                result.success = false;
                // Don't put reason in stderr for ccguard - it will be in response.reason
                // Only use stderr if there's actual stderr output that's different
                if (!response.reason && result.stderr) {
                  // Keep existing stderr if no reason in response
                } else if (result.stderr && result.stderr !== response.reason) {
                  // Keep stderr if it's different from reason
                } else {
                  result.stderr = '';  // Clear to avoid duplication
                }
                result.output = '';  // Clear output so it doesn't double-show
              } else if (response.decision === 'approve') {
                result.success = true;
                // Clear JSON output for ccguard approve responses too
                result.output = '';
              }
            }
          } catch (e) {
            // Not JSON, treat as plain text
          }
        }
        
        // Exit code handling (can override JSON response)
        if (code === EXIT_CODE.BLOCK) {
          result.blockExecution = true;
          result.success = false;
        } else if (code !== 0 && code !== null) {
          result.success = false;
        } else if (!result.response) {
          // Only set success true if not already set by JSON response
          result.success = true;
        }
        
        resolve(result);
      });
      
      child.on('error', (err) => {
        result.error = err.message;
        result.success = false;
        resolve(result);
      });
    });
  }
  
  private async executeScriptHandler(handler: Handler, hookData: HookData, result: HookExecutionResult): Promise<HookExecutionResult> {
    if (!handler.script) {
      throw new Error(`Script handler ${handler.name} has no script path`);
    }
    
    // Read script content
    const scriptContent = await readFile(handler.script, 'utf-8');
    
    // Determine script type from extension or shebang
    const ext = handler.script.split('.').pop()?.toLowerCase();
    
    if (ext === 'js' || ext === 'mjs' || scriptContent.startsWith('#!/usr/bin/env node')) {
      // Execute as JavaScript
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('hookData', 'console', 'require', scriptContent);
      try {
        const output = await fn(hookData, console, require);
        result.success = true;
        result.output = output ? String(output) : '';
      } catch (err: unknown) {
        result.success = false;
        result.error = err instanceof Error ? err.message : String(err);
      }
      return result;
    } else {
      // Execute as shell script
      const env = { ...process.env };
      env.CLAUDE_PROJECT_DIR = process.cwd();
      
      const child = spawn(handler.script, [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Capture output
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Send hook data to stdin
      child.stdin.write(JSON.stringify(hookData));
      child.stdin.end();
      
      return new Promise<HookExecutionResult>((resolve) => {
        child.on('exit', (code) => {
          result.exitCode = code || 0;
          result.output = stdout.trim();
          result.stderr = stderr.trim();
          
          if (code === EXIT_CODE.SUCCESS || code === null) {
            result.success = true;
          } else if (code === EXIT_CODE.BLOCK) {
            result.blockExecution = true;
            result.success = false;
          } else {
            result.success = false;
          }
          
          resolve(result);
        });
        
        child.on('error', (err) => {
          result.error = err.message;
          result.success = false;
          resolve(result);
        });
      });
    }
  }
  
  private async executeFunctionHandler(handler: Handler, hookData: HookData, result: HookExecutionResult): Promise<HookExecutionResult> {
    if (!handler.code) {
      throw new Error(`Function handler ${handler.name} has no code`);
    }
    
    try {
      // Create function that takes hookData and returns a result
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('hookData', 'console', 'require', `
        // Function handlers must return a result object
        const handler = async (hookData) => {
          ${handler.code}
        };
        return await handler(hookData);
      `);
      
      // Build package paths for require
      const requireForHandler = (packageName: string) => {
        const handlerPackages = packageManager.list('handler', handler.name);
        const pkg = handlerPackages.find(p => p.name === packageName);
        if (pkg) {
          const path = packageManager.getPackagePath(pkg.name, 'handler', handler.name);
          if (path) {
            const createRequire = require('module').createRequire;
            const requireFromPath = createRequire(path + '/');
            return requireFromPath(packageName);
          }
        }
        
        // Fall back to global packages
        const globalPackages = packageManager.list('global');
        const globalPkg = globalPackages.find(p => p.name === packageName);
        if (globalPkg) {
          const path = packageManager.getPackagePath(globalPkg.name, 'global');
          if (path) {
            const createRequire = require('module').createRequire;
            const requireFromPath = createRequire(path + '/');
            return requireFromPath(packageName);
          }
        }
        
        throw new Error(`Package '${packageName}' not found for handler '${handler.name}'`);
      };
      
      // Execute the function and get the result
      const functionResult = await fn(hookData, console, requireForHandler);
      
      result.response = functionResult;
      result.success = true;
      
      // Handle the result based on CC's hook API
      if (functionResult && typeof functionResult === 'object') {
        // Check for blocking response
        if (functionResult.status === 'blocked' || functionResult.blocked === true) {
          result.blockExecution = true;
          result.success = false;
          result.stderr = functionResult.message || functionResult.reason || '';
        }
        
        // Check for error response
        if (functionResult.status === 'error' || functionResult.error === true) {
          result.success = false;
          result.error = functionResult.message || functionResult.reason || '';
        }
        
        // Capture any output
        if (functionResult.message || functionResult.output) {
          result.output = functionResult.message || functionResult.output;
        }
      }
      
      return result;
    } catch (error: unknown) {
      result.error = error instanceof Error ? error.message : String(error);
      result.success = false;
      return result;
    }
  }
  
  private async executeExternalHandler(handler: Handler, hookData: HookData, result: HookExecutionResult): Promise<HookExecutionResult> {
    if (!handler.command) {
      throw new Error(`External handler ${handler.name} has no command`);
    }
    
    // Prepare environment - CC-compatible variables
    const env = { 
      ...process.env,
      CLAUDE_PROJECT_DIR: process.cwd(),
      CLAUDE_SESSION_ID: hookData.session_id,
      CLAUDE_TRANSCRIPT_PATH: hookData.transcript_path || '',
      CLAUDE_CWD: hookData.cwd || process.cwd(),
      HOOK_EVENT_NAME: hookData.hook_event_name
    };
    
    // Add any handler-specific environment variables
    if (handler.env) {
      Object.assign(env, handler.env);
    }
    
    // Build command arguments
    const args = handler.args || [];
    
    // Execute the external command
    const child = spawn(handler.command, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Capture output
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Send hook data as JSON to stdin (CC format)
    child.stdin.write(JSON.stringify(hookData));
    child.stdin.end();
    
    // Wait for completion
    return new Promise<HookExecutionResult>((resolve) => {
      child.on('exit', (code) => {
        result.exitCode = code || 0;
        result.output = stdout.trim();
        result.stderr = stderr.trim();
        
        // Try to parse JSON response
        if (result.output && result.output.startsWith('{')) {
          try {
            result.response = JSON.parse(result.output);
            
            // Handle ccguard-style responses
            if (result.response && typeof result.response === 'object') {
              const response = result.response as CcguardResponse;
              if (response.decision === 'block') {
                result.blockExecution = true;
                result.success = false;
                // Don't put reason in stderr for ccguard - it will be in response.reason
                // Only use stderr if there's actual stderr output that's different
                if (!response.reason && result.stderr) {
                  // Keep existing stderr if no reason in response
                } else if (result.stderr && result.stderr !== response.reason) {
                  // Keep stderr if it's different from reason
                } else {
                  result.stderr = '';  // Clear to avoid duplication
                }
                result.output = '';  // Clear output so it doesn't double-show
              } else if (response.decision === 'approve') {
                result.success = true;
                // Clear JSON output for ccguard approve responses too
                result.output = '';
              }
            }
          } catch (e) {
            // Not JSON, treat as plain text
          }
        }
        
        // Exit code handling (can override JSON response)
        if (code === EXIT_CODE.BLOCK) {
          result.blockExecution = true;
          result.success = false;
        } else if (code !== 0 && code !== null) {
          result.success = false;
        } else if (!result.response) {
          // Only set success true if not already set by JSON response
          result.success = true;
        }
        
        resolve(result);
      });
      
      child.on('error', (err) => {
        result.error = err.message;
        result.success = false;
        resolve(result);
      });
    });
  }
}