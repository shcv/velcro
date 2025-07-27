import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { configManager } from '../config/index.js';

export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
}

export interface InstalledPackage {
  name: string;
  version: string;
  handler?: string;
}

export class PackageManager {
  private packagesDir: string;
  private globalPackagesDir: string;

  constructor() {
    // Use configured data directory for packages
    this.packagesDir = join(configManager.getDataDirectory(), 'packages');
    this.globalPackagesDir = join(this.packagesDir, 'global');
    
    // Ensure directories exist
    mkdirSync(this.packagesDir, { recursive: true });
    mkdirSync(this.globalPackagesDir, { recursive: true });
    
    // Initialize global package.json if it doesn't exist
    const globalPackageJson = join(this.globalPackagesDir, 'package.json');
    if (!existsSync(globalPackageJson)) {
      writeFileSync(globalPackageJson, JSON.stringify({
        name: 'velcro-global-packages',
        version: '1.0.0',
        description: 'Global packages for Velcro handlers',
        private: true
      }, null, 2));
    }
  }

  private getHandlerDir(handlerName: string): string {
    return join(this.packagesDir, 'handlers', handlerName);
  }

  private ensureHandlerDir(handlerName: string): string {
    const dir = this.getHandlerDir(handlerName);
    mkdirSync(dir, { recursive: true });
    
    // Initialize package.json if it doesn't exist
    const packageJson = join(dir, 'package.json');
    if (!existsSync(packageJson)) {
      writeFileSync(packageJson, JSON.stringify({
        name: `velcro-handler-${handlerName}`,
        version: '1.0.0',
        description: `Packages for ${handlerName} handler`,
        private: true
      }, null, 2));
    }
    
    return dir;
  }

  async install(packages: string[], scope: 'handler' | 'global' = 'handler', handlerName?: string): Promise<void> {
    const targetDir = scope === 'global' 
      ? this.globalPackagesDir 
      : this.ensureHandlerDir(handlerName || 'default');

    const args = ['install', '--save', ...packages];
    
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', args, {
        cwd: targetDir,
        stdio: 'inherit'
      });

      npm.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      npm.on('error', reject);
    });
  }

  list(scope: 'handler' | 'global' = 'handler', handlerName?: string): InstalledPackage[] {
    const targetDir = scope === 'global' 
      ? this.globalPackagesDir 
      : this.getHandlerDir(handlerName || 'default');

    if (!existsSync(targetDir)) {
      return [];
    }

    try {
      const result = execSync('npm list --json --depth=0', {
        cwd: targetDir,
        encoding: 'utf8'
      });

      const data = JSON.parse(result);
      const packages: InstalledPackage[] = [];

      if (data.dependencies) {
        interface DependencyInfo {
          version?: string;
        }
        for (const [name, info] of Object.entries(data.dependencies)) {
          packages.push({
            name,
            version: (info as DependencyInfo).version || 'unknown',
            handler: scope === 'handler' ? handlerName : undefined
          });
        }
      }

      return packages;
    } catch (error) {
      // If npm list fails (e.g., no packages), return empty array
      return [];
    }
  }

  async search(query: string): Promise<PackageInfo[]> {
    try {
      const result = execSync(`npm search ${query} --json`, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for search results
      });

      const results = JSON.parse(result);
      interface NpmSearchResult {
        name: string;
        version: string;
        description?: string;
      }
      const packages: PackageInfo[] = results.map((pkg: NpmSearchResult) => ({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description
      }));
      return packages.slice(0, 10); // Return top 10 results
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  async info(packageName: string): Promise<PackageInfo | null> {
    try {
      const result = execSync(`npm view ${packageName} --json`, {
        encoding: 'utf8'
      });

      const data = JSON.parse(result);
      return {
        name: data.name,
        version: data.version,
        description: data.description,
        dependencies: data.dependencies
      };
    } catch (error) {
      return null;
    }
  }

  getPackagePath(packageName: string, scope: 'handler' | 'global' = 'handler', handlerName?: string): string | null {
    const targetDir = scope === 'global' 
      ? this.globalPackagesDir 
      : this.getHandlerDir(handlerName || 'default');

    const packagePath = join(targetDir, 'node_modules', packageName);
    return existsSync(packagePath) ? packagePath : null;
  }

  // Get all packages available to a handler (both handler-specific and global)
  getAvailablePackages(handlerName: string): InstalledPackage[] {
    const handlerPackages = this.list('handler', handlerName);
    const globalPackages = this.list('global');
    
    // Merge, with handler packages taking precedence
    const packageMap = new Map<string, InstalledPackage>();
    
    globalPackages.forEach(pkg => packageMap.set(pkg.name, pkg));
    handlerPackages.forEach(pkg => packageMap.set(pkg.name, pkg));
    
    return Array.from(packageMap.values());
  }
}

export const packageManager = new PackageManager();