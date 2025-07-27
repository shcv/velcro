import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMCPServer } from './mcp-handlers.js';

interface Session {
  server: Server;
  initialized: boolean;
  lastAccess: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor() {
    // Clean up inactive sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }
  
  getOrCreateSession(sessionId: string): Server {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      const server = createMCPServer();
      session = {
        server,
        initialized: false,
        lastAccess: Date.now()
      };
      this.sessions.set(sessionId, session);
    }
    
    session.lastAccess = Date.now();
    return session.server;
  }
  
  markInitialized(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.initialized = true;
    }
  }
  
  isInitialized(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.initialized || false;
  }
  
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
  
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccess > timeout) {
        this.sessions.delete(sessionId);
        console.error(`Cleaned up inactive session: ${sessionId}`);
      }
    }
  }
  
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}