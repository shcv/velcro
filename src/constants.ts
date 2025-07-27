/**
 * Constants used throughout the application
 */

// Exit codes
export const EXIT_CODE = {
  SUCCESS: 0,
  ERROR: 1,
  BLOCK: 2,
} as const;

// Default values
export const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes
export const DEFAULT_LOG_ROTATION_SIZE = '20m';
export const DEFAULT_LOG_RETENTION_DAYS = 14;
export const DEFAULT_PORT = 3000;

// Resource limits
export const MAX_LOG_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_CONCURRENT_HANDLERS = 10;
export const MAX_PACKAGE_NAME_LENGTH = 214; // npm limit

// File paths
export const CONFIG_FILE_NAME = 'config.json';
export const LOG_FILE_NAME = 'hooks.log';

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;