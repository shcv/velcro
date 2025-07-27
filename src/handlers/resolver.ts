import { Handler } from '../config/index.js';
import { configManager } from '../config/index.js';
import { projectConfigManager } from '../config/project-config.js';
import { sessionStateManager } from '../session/state.js';
import { HookData } from '../types/hooks.js';
import { logger } from '../logging/logger.js';

export class HandlerResolver {
  /**
   * Resolve which handlers should run for a given hook event
   * Takes into account global, project, and session configurations
   */
  resolveHandlers(hookData: HookData): Handler[] {
    const allHandlers = configManager.listHandlers();
    const resolvedHandlers: Handler[] = [];

    // Load project config if in a project context
    if (hookData.cwd) {
      projectConfigManager.loadProjectConfig(hookData.cwd);
    }

    for (const handler of allHandlers) {
      // Check if handler should run based on configuration hierarchy
      if (this.shouldRunHandler(handler, hookData)) {
        // Apply any project-level overrides
        const overrides = projectConfigManager.getHandlerOverrides(handler.name);
        if (overrides) {
          // Create a new handler object with overrides applied
          const mergedHandler = { ...handler, ...overrides };
          resolvedHandlers.push(mergedHandler);
        } else {
          resolvedHandlers.push(handler);
        }
      }
    }

    logger.debug(`Resolved ${resolvedHandlers.length} handlers for ${hookData.hook_event_name}`, {
      handlers: resolvedHandlers.map(h => h.name),
      sessionId: hookData.session_id
    });

    return resolvedHandlers;
  }

  /**
   * Determine if a handler should run based on configuration hierarchy
   */
  private shouldRunHandler(handler: Handler, hookData: HookData): boolean {
    // 1. Check session-level override (highest priority)
    const sessionOverride = sessionStateManager.isHookEnabledForSession(
      hookData.session_id,
      handler.name
    );
    if (sessionOverride !== undefined) {
      logger.debug(`Session override for ${handler.name}: ${sessionOverride}`);
      return sessionOverride;
    }

    // 2. Check project-level configuration
    const projectEnabled = projectConfigManager.isHandlerEnabled(
      handler.name,
      handler.enabled
    );
    
    // 3. Check if handler matches the hook type
    if (!handler.hooks.includes(hookData.hook_event_name)) {
      return false;
    }

    return projectEnabled;
  }

  /**
   * Enable a handler for the current session
   */
  enableHandlerForSession(sessionId: string, handlerName: string): boolean {
    const handler = configManager.getHandler(handlerName);
    if (!handler) {
      return false;
    }

    sessionStateManager.enableHookForSession(sessionId, handlerName);
    logger.info(`Enabled handler ${handlerName} for session ${sessionId}`);
    return true;
  }

  /**
   * Disable a handler for the current session
   */
  disableHandlerForSession(sessionId: string, handlerName: string): boolean {
    const handler = configManager.getHandler(handlerName);
    if (!handler) {
      return false;
    }

    sessionStateManager.disableHookForSession(sessionId, handlerName);
    logger.info(`Disabled handler ${handlerName} for session ${sessionId}`);
    return true;
  }

  /**
   * Get current handler status for a session
   */
  getHandlerStatus(sessionId: string): Array<{
    name: string;
    globalEnabled: boolean;
    projectEnabled: boolean;
    sessionOverride?: boolean;
    effectiveEnabled: boolean;
  }> {
    const handlers = configManager.listHandlers();
    const statuses = [];

    for (const handler of handlers) {
      const sessionOverride = sessionStateManager.isHookEnabledForSession(sessionId, handler.name);
      const projectEnabled = projectConfigManager.isHandlerEnabled(handler.name, handler.enabled);
      
      let effectiveEnabled = projectEnabled;
      if (sessionOverride !== undefined) {
        effectiveEnabled = sessionOverride;
      }

      statuses.push({
        name: handler.name,
        globalEnabled: handler.enabled,
        projectEnabled,
        sessionOverride,
        effectiveEnabled
      });
    }

    return statuses;
  }
}

// Export singleton instance
export const handlerResolver = new HandlerResolver();