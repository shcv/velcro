/**
 * Utility functions and types for consistent error handling
 */

/**
 * Type guard to check if a value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  return String(error);
}

/**
 * Safely extract error stack from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  return undefined;
}

/**
 * Error with exit code for process errors
 */
export interface ProcessError extends Error {
  exitCode?: number;
}

/**
 * Type guard for ProcessError
 */
export function isProcessError(error: unknown): error is ProcessError {
  return isError(error) && 'exitCode' in error;
}