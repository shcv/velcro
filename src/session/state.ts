export interface SessionHookState {
  sessionId: string;
  enabledHooks: Set<string>;
  disabledHooks: Set<string>;
  createdAt: Date;
  lastModified: Date;
  temporary: boolean; // If true, reset on session end
}

export class SessionStateManager {
  private sessions = new Map<string, SessionHookState>();

  /**
   * Get or create session state
   */
  getOrCreateSession(sessionId: string): SessionHookState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        enabledHooks: new Set(),
        disabledHooks: new Set(),
        createdAt: new Date(),
        lastModified: new Date(),
        temporary: true
      });
    }
    return this.sessions.get(sessionId)!;
  }

  /**
   * Enable a hook for a specific session
   */
  enableHookForSession(sessionId: string, hookName: string): void {
    const session = this.getOrCreateSession(sessionId);
    session.enabledHooks.add(hookName);
    session.disabledHooks.delete(hookName); // Remove from disabled if present
    session.lastModified = new Date();
  }

  /**
   * Disable a hook for a specific session
   */
  disableHookForSession(sessionId: string, hookName: string): void {
    const session = this.getOrCreateSession(sessionId);
    session.disabledHooks.add(hookName);
    session.enabledHooks.delete(hookName); // Remove from enabled if present
    session.lastModified = new Date();
  }

  /**
   * Check if a hook is enabled for a session
   * Returns undefined if no session override exists
   */
  isHookEnabledForSession(sessionId: string, hookName: string): boolean | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (session.disabledHooks.has(hookName)) {
      return false;
    }

    if (session.enabledHooks.has(hookName)) {
      return true;
    }

    return undefined; // No override
  }

  /**
   * Clear session state
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all session states (for debugging/monitoring)
   */
  getAllSessions(): SessionHookState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastModified.getTime() > maxAgeMs) {
        toDelete.push(sessionId);
      }
    }

    for (const sessionId of toDelete) {
      this.sessions.delete(sessionId);
    }
  }
}

// Export singleton instance
export const sessionStateManager = new SessionStateManager();