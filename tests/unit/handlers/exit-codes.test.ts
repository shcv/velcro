import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HandlerExecutor, HookExecutionResult } from '../../../src/handlers/executor.js';
import { Handler } from '../../../src/config/index.js';
import { EXIT_CODE } from '../../../src/constants.js';
import { PreToolUseHookData } from '../../../src/types/hooks.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock the logger
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

describe('Exit Code Handling', () => {
  let executor: HandlerExecutor;
  
  const mockHookData: PreToolUseHookData = {
    hook_event_name: 'PreToolUse',
    session_id: 'test-session',
    transcript_path: '/tmp/transcript',
    cwd: '/test/dir',
    tool_name: 'SensitiveTool',
    tool_input: { action: 'delete', path: '/etc/passwd' }
  };

  beforeEach(() => {
    executor = new HandlerExecutor();
    vi.clearAllMocks();
  });

  describe('JSON response vs exit code precedence', () => {
    it('should let exit code 2 override JSON approve response', async () => {
      const handler: Handler = {
        name: 'exit-override-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo \'{"decision": "approve"}\'; exit 2'
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      mockChild.stdout.emit('data', '{"decision": "approve"}');
      mockChild.emit('exit', EXIT_CODE.BLOCK);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.blockExecution).toBe(true);
      expect(result.exitCode).toBe(2);
      expect(result.response).toEqual({ decision: 'approve' });
    });

    it('should respect JSON block decision even with exit code 0', async () => {
      const handler: Handler = {
        name: 'json-block-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo \'{"decision": "block", "reason": "Policy violation"}\''
      };

      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      mockChild.stdout.emit('data', '{"decision": "block", "reason": "Policy violation"}');
      mockChild.emit('exit', EXIT_CODE.SUCCESS);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.blockExecution).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.response).toEqual({ decision: 'block', reason: 'Policy violation' });
    });
  });

  describe('error handling with exit codes', () => {
    it('should preserve blockExecution flag in error objects', async () => {
      const handler: Handler = {
        name: 'error-block-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'velcro',
        code: 'throw new Error("Blocked!");'
      };

      // Create a special error with blockExecution flag
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const resultPromise = executor.execute(handler, mockHookData);
      
      // Simulate the velcro runner throwing an error with exit code 2
      mockChild.stderr.emit('data', 'Error: Blocked!');
      mockChild.emit('exit', EXIT_CODE.BLOCK);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.blockExecution).toBe(true);
      expect(result.exitCode).toBe(2);
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