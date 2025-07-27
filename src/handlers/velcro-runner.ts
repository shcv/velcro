#!/usr/bin/env node
import { EXIT_CODE } from '../constants.js';
/**
 * Isolated runner for velcro handlers
 * This runs in a separate process to prevent handlers from crashing the main server
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// Read handler config from environment
const handlerName = process.env.HANDLER_NAME || 'unknown';
const handlerCode = process.env.HANDLER_CODE || '';
const packagePaths = JSON.parse(process.env.PACKAGE_PATHS || '{}');

// Read hook data from stdin
let inputData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    const hookData = JSON.parse(inputData);
    
    // Create custom require function
    const requireForHandler = (packageName: string): unknown => {
      const packagePath = packagePaths[packageName];
      
      if (!packagePath) {
        throw new Error(`Package '${packageName}' not found for handler '${handlerName}'`);
      }
      
      // Create require from the package directory
      const requireFromPath = createRequire(pathToFileURL(packagePath + '/').href);
      return requireFromPath(packageName);
    };
    
    // Store the original process.exit to restore it later
    const originalExit = process.exit;
    
    // Override the global process.exit to intercept all exit calls
    process.exit = (code?: number): never => {
      // Restore original exit function before throwing
      process.exit = originalExit;
      
      // Throw an error with the exit code
      interface ProcessError extends Error {
        exitCode?: number;
      }
      const error = new Error(`Handler exited with code ${code}`) as ProcessError;
      error.exitCode = code;
      throw error;
    };
    
    try {
      // Create async function and execute
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('hookData', 'console', 'require', 'process', handlerCode);
      
      // Provide a wrapped process object that also intercepts exit calls
      const wrappedProcess = {
        ...process,
        exit: process.exit // Use the overridden global exit
      };
      
      await fn(hookData, console, requireForHandler, wrappedProcess);
    } finally {
      // Always restore the original process.exit
      process.exit = originalExit;
    }
    
    // Success
    process.exit(EXIT_CODE.SUCCESS);
  } catch (error: unknown) {
    // Check if this is an exit call
    interface ProcessError extends Error {
      exitCode?: number;
    }
    if (error instanceof Error && 'exitCode' in error && typeof (error as ProcessError).exitCode === 'number') {
      process.exit((error as ProcessError).exitCode || EXIT_CODE.ERROR);
    }
    
    // Other errors - don't add extra stderr output that could interfere
    process.exit(EXIT_CODE.ERROR);
  }
});