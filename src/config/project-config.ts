import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Handler } from './index.js';

export interface ProjectHookConfig {
  enabled?: string[];
  disabled?: string[];
  overrides?: Record<string, Partial<Handler>>;
}

export interface ProjectConfig {
  hooks?: ProjectHookConfig;
  settings?: Record<string, unknown>;
}

export class ProjectConfigManager {
  private projectConfig: ProjectConfig | null = null;
  private projectRoot: string | null = null;

  /**
   * Find and load project configuration
   */
  loadProjectConfig(startDir: string = process.cwd()): ProjectConfig | null {
    const configPath = this.findProjectConfig(startDir);
    if (!configPath) {
      return null;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      this.projectConfig = JSON.parse(content);
      this.projectRoot = join(configPath, '..');
      return this.projectConfig;
    } catch (error) {
      console.error(`Failed to load project config from ${configPath}:`, error);
      return null;
    }
  }

  /**
   * Find .velcro/project.json by traversing up the directory tree
   */
  private findProjectConfig(startDir: string): string | null {
    let currentDir = startDir;
    const root = '/';

    while (currentDir !== root) {
      const configPath = join(currentDir, '.velcro', 'project.json');
      if (existsSync(configPath)) {
        return configPath;
      }
      
      const parentDir = join(currentDir, '..');
      if (parentDir === currentDir) {
        break; // Reached root
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Check if a handler should be enabled based on project config
   */
  isHandlerEnabled(handlerName: string, globalEnabled: boolean): boolean {
    if (!this.projectConfig?.hooks) {
      return globalEnabled;
    }

    const { enabled, disabled } = this.projectConfig.hooks;

    // Explicit disable takes precedence
    if (disabled?.includes(handlerName)) {
      return false;
    }

    // Explicit enable
    if (enabled?.includes(handlerName)) {
      return true;
    }

    // Fall back to global setting
    return globalEnabled;
  }

  /**
   * Get handler overrides from project config
   */
  getHandlerOverrides(handlerName: string): Partial<Handler> | undefined {
    return this.projectConfig?.hooks?.overrides?.[handlerName];
  }

  /**
   * Get the project root directory
   */
  getProjectRoot(): string | null {
    return this.projectRoot;
  }

  /**
   * Clear loaded project config
   */
  clear(): void {
    this.projectConfig = null;
    this.projectRoot = null;
  }
}

// Export singleton instance
export const projectConfigManager = new ProjectConfigManager();