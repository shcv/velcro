import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { configManager } from '../config/index.js';

export interface HandlerStats {
  executions: number;
  failures: number;
  totalDuration: number;
  avgDuration: number;
  lastExecution?: string;
  lastError?: string;
  successRate: number;
}

export interface HandlerStatsEntry {
  handlerName: string;
  stats: HandlerStats;
}

export class StatsManager {
  private statsFile: string;
  private stats: Map<string, HandlerStats> = new Map();

  constructor() {
    // Use configured data directory
    const dataDir = configManager.getDataDirectory();
    mkdirSync(dataDir, { recursive: true });
    
    this.statsFile = join(dataDir, 'handler-stats.json');
    this.loadStats();
  }

  private loadStats(): void {
    if (existsSync(this.statsFile)) {
      try {
        const data = JSON.parse(readFileSync(this.statsFile, 'utf-8'));
        this.stats = new Map(Object.entries(data));
      } catch (error) {
        console.error('Failed to load handler stats:', error);
      }
    }
  }

  private saveStats(): void {
    const data = Object.fromEntries(this.stats);
    writeFileSync(this.statsFile, JSON.stringify(data, null, 2));
  }

  recordExecution(handlerName: string, duration: number, success: boolean, error?: string): void {
    let stats = this.stats.get(handlerName) || {
      executions: 0,
      failures: 0,
      totalDuration: 0,
      avgDuration: 0,
      successRate: 0
    };

    stats.executions++;
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.executions;
    stats.lastExecution = new Date().toISOString();

    if (!success) {
      stats.failures++;
      stats.lastError = error || 'Unknown error';
    }

    stats.successRate = ((stats.executions - stats.failures) / stats.executions) * 100;

    this.stats.set(handlerName, stats);
    this.saveStats();
  }

  getStats(handlerName: string): HandlerStats | undefined {
    return this.stats.get(handlerName);
  }

  getAllStats(): HandlerStatsEntry[] {
    return Array.from(this.stats.entries()).map(([name, stats]) => ({
      handlerName: name,
      stats
    }));
  }

  resetStats(handlerName?: string): void {
    if (handlerName) {
      this.stats.delete(handlerName);
    } else {
      this.stats.clear();
    }
    this.saveStats();
  }
}

// Export singleton instance
export const statsManager = new StatsManager();