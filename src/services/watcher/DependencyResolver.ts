import * as path from 'path';
import * as fs from 'fs';

/**
 * Dependency information for a file
 */
export interface FileDependency {
  /**
   * File path
   */
  path: string;

  /**
   * Files this file depends on
   */
  dependencies: Set<string>;

  /**
   * Files that depend on this file
   */
  dependents: Set<string>;
}

/**
 * Result of topological sort
 */
export interface TopologicalSortResult {
  /**
   * Sorted file paths in dependency order
   */
  sorted: string[];

  /**
   * Whether a cycle was detected
   */
  hasCycle: boolean;

  /**
   * Files involved in cycles (if any)
   */
  cycleNodes?: string[];
}

/**
 * Resolves dependencies between files and sorts them topologically
 */
export class DependencyResolver {
  private dependencyGraph: Map<string, FileDependency>;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.dependencyGraph = new Map();
  }

  /**
   * Parses dependencies from a file's content
   * @param filePath File path
   * @param content File content
   * @returns Array of dependency paths
   */
  parseDependencies(filePath: string, content: string): string[] {
    const dependencies: string[] = [];
    const fileExt = path.extname(filePath);
    const fileDir = path.dirname(filePath);

    // JavaScript/TypeScript imports
    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(fileExt)) {
      dependencies.push(...this.parseJavaScriptDependencies(content, fileDir));
    }

    // Python imports
    if (['.py'].includes(fileExt)) {
      dependencies.push(...this.parsePythonDependencies(content, fileDir));
    }

    // CSS/SCSS imports
    if (['.css', '.scss', '.sass', '.less'].includes(fileExt)) {
      dependencies.push(...this.parseCssDependencies(content, fileDir));
    }

    // Unique and resolve paths
    return [...new Set(dependencies)].map(dep => this.resolvePath(dep, fileDir));
  }

  /**
   * Parses JavaScript/TypeScript dependencies
   * @param content File content
   * @param fileDir Directory of the file
   * @returns Array of dependency paths
   */
  private parseJavaScriptDependencies(content: string, _fileDir: string): string[] {
    const dependencies: string[] = [];

    // ES6 imports: import ... from '...'
    const es6ImportRegex = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      dependencies.push(match[1] || '');
    }

    // CommonJS require: require('...')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push(match[1] || '');
    }

    // Dynamic imports: import('...')
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      dependencies.push(match[1] || '');
    }

    return dependencies.filter(dep => dep && this.isLocalDependency(dep));
  }

  /**
   * Parses Python dependencies
   * @param content File content
   * @param fileDir Directory of the file (currently unused)
   * @returns Array of dependency paths
   */
  private parsePythonDependencies(content: string, _fileDir: string): string[] {
    const dependencies: string[] = [];

    // import statements
    const importRegex = /^\s*import\s+(\S+)/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const module = match[1];
      if (module) {
        const filePath = module.replace(/\./g, '/') + '.py';
        dependencies.push(filePath);
      }
    }

    // from ... import statements
    const fromImportRegex = /^\s*from\s+(\S+)\s+import/gm;
    while ((match = fromImportRegex.exec(content)) !== null) {
      const module = match[1];
      if (module && module !== '.' && module !== '..') {
        const filePath = module.replace(/\./g, '/') + '.py';
        dependencies.push(filePath);
      }
    }

    return dependencies.filter(dep => this.isLocalDependency(dep));
  }

  /**
   * Parses CSS/SCSS dependencies
   * @param content File content
   * @param fileDir Directory of the file (currently unused)
   * @returns Array of dependency paths
   */
  private parseCssDependencies(content: string, _fileDir: string): string[] {
    const dependencies: string[] = [];

    // @import statements
    const importRegex = /@import\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1] || '');
    }

    // url() references (for local files)
    const urlRegex = /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/g;
    while ((match = urlRegex.exec(content)) !== null) {
      const url = match[1];
      if (url && this.isLocalDependency(url)) {
        dependencies.push(url);
      }
    }

    return dependencies.filter(dep => dep && this.isLocalDependency(dep));
  }

  /**
   * Checks if a dependency is local (not a package)
   * @param dep Dependency path
   * @returns True if local dependency
   */
  private isLocalDependency(dep: string): boolean {
    // Skip package dependencies
    if (!dep.startsWith('.') && !dep.startsWith('/')) {
      return false;
    }

    // Skip URLs
    if (dep.includes('://')) {
      return false;
    }

    return true;
  }

  /**
   * Resolves a dependency path relative to a file directory
   * @param dep Dependency path
   * @param fileDir File directory
   * @returns Resolved path
   */
  private resolvePath(dep: string, fileDir: string): string {
    if (path.isAbsolute(dep)) {
      return path.relative(this.projectRoot, dep);
    }

    const resolved = path.resolve(fileDir, dep);
    return path.relative(this.projectRoot, resolved);
  }

  /**
   * Builds dependency graph for a set of files
   * @param filePaths Array of file paths to analyze
   */
  async buildDependencyGraph(filePaths: string[]): Promise<void> {
    this.dependencyGraph.clear();

    for (const filePath of filePaths) {
      if (!this.dependencyGraph.has(filePath)) {
        this.dependencyGraph.set(filePath, {
          path: filePath,
          dependencies: new Set(),
          dependents: new Set()
        });
      }

      try {
        const fullPath = path.resolve(this.projectRoot, filePath);
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const deps = this.parseDependencies(filePath, content);

        const fileNode = this.dependencyGraph.get(filePath)!;
        for (const dep of deps) {
          // Add dependency
          fileNode.dependencies.add(dep);

          // Create dependency node if it doesn't exist
          if (!this.dependencyGraph.has(dep)) {
            this.dependencyGraph.set(dep, {
              path: dep,
              dependencies: new Set(),
              dependents: new Set()
            });
          }

          // Add this file as dependent of the dependency
          this.dependencyGraph.get(dep)!.dependents.add(filePath);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
  }

  /**
   * Performs topological sort using Kahn's algorithm
   * @param filePaths Optional subset of files to sort
   * @returns Topological sort result
   */
  topologicalSort(filePaths?: string[]): TopologicalSortResult {
    const nodes = filePaths || Array.from(this.dependencyGraph.keys());
    const result: string[] = [];
    const inDegree = new Map<string, number>();
    const queue: string[] = [];

    // Initialize in-degree for each node
    for (const node of nodes) {
      const deps = this.dependencyGraph.get(node)?.dependencies || new Set();
      const relevantDeps = Array.from(deps).filter(dep => nodes.includes(dep));
      inDegree.set(node, relevantDeps.length);

      if (relevantDeps.length === 0) {
        queue.push(node);
      }
    }

    // Process nodes with no dependencies
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Reduce in-degree for dependent nodes
      const dependents = this.dependencyGraph.get(current)?.dependents || new Set();
      for (const dependent of dependents) {
        if (!nodes.includes(dependent)) continue;

        const currentInDegree = inDegree.get(dependent) || 0;
        inDegree.set(dependent, currentInDegree - 1);

        if (currentInDegree - 1 === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    const hasCycle = result.length !== nodes.length;
    let cycleNodes: string[] | undefined;

    if (hasCycle) {
      // Find nodes involved in cycles
      cycleNodes = nodes.filter(node => !result.includes(node));
    }

    return {
      sorted: result,
      hasCycle,
      cycleNodes
    };
  }

  /**
   * Gets files affected by changes to given files
   * @param changedFiles Files that have changed
   * @returns Set of affected files (including changed files)
   */
  getAffectedFiles(changedFiles: string[]): Set<string> {
    const affected = new Set<string>(changedFiles);
    const visited = new Set<string>();
    const queue = [...changedFiles];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const dependents = this.dependencyGraph.get(current)?.dependents || new Set();
      for (const dependent of dependents) {
        affected.add(dependent);
        if (!visited.has(dependent)) {
          queue.push(dependent);
        }
      }
    }

    return affected;
  }

  /**
   * Gets direct dependencies of a file
   * @param filePath File path
   * @returns Array of dependency paths
   */
  getDependencies(filePath: string): string[] {
    return Array.from(this.dependencyGraph.get(filePath)?.dependencies || new Set());
  }

  /**
   * Gets direct dependents of a file
   * @param filePath File path
   * @returns Array of dependent paths
   */
  getDependents(filePath: string): string[] {
    return Array.from(this.dependencyGraph.get(filePath)?.dependents || new Set());
  }

  /**
   * Clears the dependency graph
   */
  clear(): void {
    this.dependencyGraph.clear();
  }

  /**
   * Gets the size of the dependency graph
   * @returns Number of nodes in the graph
   */
  getGraphSize(): number {
    return this.dependencyGraph.size;
  }

  /**
   * Checks if a file has dependencies
   * @param filePath File path
   * @returns True if file has dependencies
   */
  hasDependencies(filePath: string): boolean {
    const deps = this.dependencyGraph.get(filePath)?.dependencies;
    return deps ? deps.size > 0 : false;
  }

  /**
   * Checks if a file has dependents
   * @param filePath File path
   * @returns True if file has dependents
   */
  hasDependents(filePath: string): boolean {
    const deps = this.dependencyGraph.get(filePath)?.dependents;
    return deps ? deps.size > 0 : false;
  }
}

/**
 * Creates a new DependencyResolver instance
 * @param projectRoot Project root directory
 * @returns New DependencyResolver
 */
export function createDependencyResolver(projectRoot: string): DependencyResolver {
  return new DependencyResolver(projectRoot);
}