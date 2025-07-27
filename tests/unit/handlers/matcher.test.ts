import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HandlerExecutor } from '../../../src/handlers/executor.js';
import { Handler } from '../../../src/config/index.js';
import { PreToolUseHookData, UserPromptSubmitHookData, StopHookData } from '../../../src/types/hooks.js';

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

describe('Hook Matcher Functionality', () => {
  let executor: HandlerExecutor;

  beforeEach(() => {
    executor = new HandlerExecutor();
  });

  describe('tool name matching', () => {
    const mockToolHookData: PreToolUseHookData = {
      hook_event_name: 'PreToolUse',
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      cwd: '/test/dir',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' }
    };

    it('should match exact tool name', () => {
      const handler: Handler = {
        name: 'bash-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: 'Bash'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should match with regex pattern', () => {
      const handler: Handler = {
        name: 'shell-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '^(Bash|Shell|Zsh)$'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should match wildcard pattern', () => {
      const handler: Handler = {
        name: 'any-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '*'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should not match different tool name', () => {
      const handler: Handler = {
        name: 'git-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: 'Git'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(false);
    });

    it('should match case-insensitive regex', () => {
      const handler: Handler = {
        name: 'case-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '[Bb][Aa][Ss][Hh]'  // JavaScript doesn't support (?i) flag inline
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should handle invalid regex gracefully', () => {
      const handler: Handler = {
        name: 'invalid-regex-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '['  // Invalid regex
      };

      // Should default to matching when regex is invalid
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      
      expect(matches).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid matcher regex'),
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should match empty matcher', () => {
      const handler: Handler = {
        name: 'no-matcher-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: ''
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should match undefined matcher', () => {
      const handler: Handler = {
        name: 'undefined-matcher-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched'
      };

      const matches = executor['matchesFilter'](handler.matcher, mockToolHookData);
      expect(matches).toBe(true);
    });
  });

  describe('non-tool hook matching', () => {
    const mockPromptHookData: UserPromptSubmitHookData = {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      cwd: '/test/dir',
      prompt: 'Test prompt'
    };

    const mockStopHookData: StopHookData = {
      hook_event_name: 'Stop',
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      cwd: '/test/dir',
      stop_hook_active: true
    };

    it('should match non-tool hooks with wildcard matcher', () => {
      const handler: Handler = {
        name: 'prompt-handler',
        enabled: true,
        hooks: ['UserPromptSubmit'],
        type: 'command',
        command: 'echo matched',
        matcher: '*'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockPromptHookData);
      expect(matches).toBe(true);
    });

    it('should match non-tool hooks with empty matcher', () => {
      const handler: Handler = {
        name: 'stop-handler',
        enabled: true,
        hooks: ['Stop'],
        type: 'command',
        command: 'echo matched',
        matcher: ''
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockStopHookData);
      expect(matches).toBe(true);
    });

    it('should match non-tool hooks without matcher', () => {
      const handler: Handler = {
        name: 'prompt-handler',
        enabled: true,
        hooks: ['UserPromptSubmit'],
        type: 'command',
        command: 'echo matched'
      };

      const matches = executor['matchesFilter'](handler.matcher, mockPromptHookData);
      expect(matches).toBe(true);
    });

    it('should ignore specific matcher for non-tool hooks', () => {
      const handler: Handler = {
        name: 'prompt-handler',
        enabled: true,
        hooks: ['UserPromptSubmit'],
        type: 'command',
        command: 'echo matched',
        matcher: 'SomeToolName'  // This should be ignored for non-tool hooks
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockPromptHookData);
      expect(matches).toBe(false);
    });
  });

  describe('complex regex patterns', () => {
    const mockToolHookData: PreToolUseHookData = {
      hook_event_name: 'PreToolUse',
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      cwd: '/test/dir',
      tool_name: 'FileSystemWrite',
      tool_input: { path: '/etc/passwd' }
    };

    it('should match tools containing specific words', () => {
      const handler: Handler = {
        name: 'file-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '.*File.*'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should match tools ending with specific suffix', () => {
      const handler: Handler = {
        name: 'write-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '.*Write$'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should match tools with OR conditions', () => {
      const handler: Handler = {
        name: 'io-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '.*(Read|Write)$'
      };

      const matches = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      expect(matches).toBe(true);
    });

    it('should not match negative lookahead', () => {
      const mockSafeToolData: PreToolUseHookData = {
        ...mockToolHookData,
        tool_name: 'FileSystemRead'
      };

      const handler: Handler = {
        name: 'no-read-handler',
        enabled: true,
        hooks: ['PreToolUse'],
        type: 'command',
        command: 'echo matched',
        matcher: '^(?!.*Read).*$'  // Match anything NOT containing "Read"
      };

      const matchesWrite = executor['matchesFilter'](handler.matcher!, mockToolHookData);
      const matchesRead = executor['matchesFilter'](handler.matcher!, mockSafeToolData);
      
      expect(matchesWrite).toBe(true);
      expect(matchesRead).toBe(false);
    });
  });
});