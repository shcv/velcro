import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HandlerExecutor } from '../../../src/handlers/executor.js';
import { Handler } from '../../../src/config/index.js';
import { EXIT_CODE } from '../../../src/constants.js';
import { PreToolUseHookData } from '../../../src/types/hooks.js';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { EventEmitter } from 'events';

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

// Mock the logger to prevent console output during tests
vi.mock('../../../src/logging/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock the stats manager
vi.mock('../../../src/handlers/stats.js', () => ({
  statsManager: {
    recordExecution: vi.fn()
  }
}));

describe('HandlerExecutor', () => {
  let executor: HandlerExecutor;
  
  const mockHookData: PreToolUseHookData = {
    hook_event_name: 'PreToolUse',
    session_id: 'test-session',
    transcript_path: '/tmp/transcript',
    cwd: '/test/dir',
    tool_name: 'TestTool',
    tool_input: { param: 'value' }
  };

  beforeEach(() => {
    executor = new HandlerExecutor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('execute', () => {
    it('should skip handler execution when matcher does not match tool name', async () => {
      const handler: Handler = {
        name: 'test-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo test',
        matcher: 'OtherTool'
      };

      const result = await executor.execute(handler, mockHookData);

      expect(result.success).toBe(true);
      expect(result.handler).toBe('test-handler');
      expect(spawn).not.toHaveBeenCalled();
    });

    // Integration test would be better for verifying actual command execution

    it('should handle unknown handler type', async () => {
      const handler: Handler = {
        name: 'test-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'unknown' as any
      };

      const result = await executor.execute(handler, mockHookData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown handler type');
    });
  });

  describe('velcro handler execution', () => {
    it('should handle missing code in velcro handler', async () => {
      const handler: Handler = {
        name: 'test-velcro',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'velcro'
      };

      const result = await executor.execute(handler, mockHookData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('has no code');
    });
  });

  describe('command handler execution', () => {
    it('should handle exit code 2 as blocking execution', async () => {
      const handler: Handler = {
        name: 'test-command',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'exit 2'
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      
      mockChild.stderr.emit('data', 'Blocking reason');
      mockChild.emit('exit', EXIT_CODE.BLOCK);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.blockExecution).toBe(true);
      expect(result.exitCode).toBe(EXIT_CODE.BLOCK);
      expect(result.stderr).toBe('Blocking reason');
    });

    it('should parse JSON response with block decision', async () => {
      const handler: Handler = {
        name: 'test-command',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo \'{"decision": "block", "reason": "Security violation"}\''
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      
      mockChild.stdout.emit('data', '{"decision": "block", "reason": "Security violation"}');
      mockChild.emit('exit', 0);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.blockExecution).toBe(true);
      expect(result.response).toEqual({ decision: 'block', reason: 'Security violation' });
    });

    it('should handle command without command field', async () => {
      const handler: Handler = {
        name: 'test-command',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command'
      };

      const result = await executor.execute(handler, mockHookData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('has no command');
    });
  });

  describe('script handler execution', () => {
    it('should handle missing script path', async () => {
      const handler: Handler = {
        name: 'test-script',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'script'
      };

      const result = await executor.execute(handler, mockHookData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('has no script path');
    });
  });

  describe('exit code handling', () => {
    it('should treat exit code 0 as success', async () => {
      const handler: Handler = {
        name: 'test-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'exit 0'
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      mockChild.emit('exit', 0);
      
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.blockExecution).toBeUndefined();
    });

    it('should treat exit code 2 as blocking', async () => {
      const handler: Handler = {
        name: 'test-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'exit 2'
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      mockChild.emit('exit', 2);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.blockExecution).toBe(true);
    });

    it('should treat non-zero exit codes (except 2) as failure', async () => {
      const handler: Handler = {
        name: 'test-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'exit 1'
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      mockChild.emit('exit', 1);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.blockExecution).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle spawn errors gracefully', async () => {
      const handler: Handler = {
        name: 'test-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'test-command'
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      mockChild.emit('error', new Error('Command not found'));
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Command not found');
    });
  });
});

// Helper function to create a mock child process
function createMockChildProcess() {
  const mockChild = new EventEmitter();
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();
  mockChild.stdin = {
    write: vi.fn(),
    end: vi.fn()
  };
  return mockChild;
}