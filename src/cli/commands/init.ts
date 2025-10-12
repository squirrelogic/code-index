import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../services/database.js';
import { generateMCPConfig, mcpConfigToString } from '../../lib/mcp-config.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter } from '../utils/output.js';
import type { ProjectConfiguration } from '../../models/project-config.js';
import { DEFAULT_PROJECT_CONFIG } from '../../models/project-config.js';

interface InitOptions {
  force?: boolean;
  json?: boolean;
}

/**
 * Initialize command implementation
 */
export function createInitCommand(): Command {
  const cmd = new Command('init');

  cmd
    .description('Initialize code-index in current project')
    .option('-f, --force', 'Reinitialize even if already set up')
    .option('--json', 'Output result as JSON')
    .action(async (options: InitOptions) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await initializeProject(projectRoot, options, output);

        if (result.success) {
          output.success(`Initialized code-index in ${projectRoot}`, {
            directories_created: result.directoriesCreated,
            files_created: result.filesCreated,
            already_existed: result.alreadyExisted
          });
        } else {
          output.error('Failed to initialize code-index', result.error);
          process.exit(1);
        }
      } catch (error: any) {
        output.error('Unexpected error during initialization', error);
        process.exit(1);
      }
    });

  return cmd;
}

interface InitResult {
  success: boolean;
  directoriesCreated: string[];
  filesCreated: string[];
  alreadyExisted: string[];
  error?: Error;
}

/**
 * Initializes project with code-index infrastructure
 */
async function initializeProject(
  projectRoot: string,
  options: InitOptions,
  output: OutputFormatter
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    directoriesCreated: [],
    filesCreated: [],
    alreadyExisted: []
  };

  const logger = new Logger(projectRoot);
  logger.info('Initializing code-index', { projectRoot, options });

  // Define paths
  const codeIndexDir = join(projectRoot, '.codeindex');
  const logsDir = join(codeIndexDir, 'logs');
  const claudeDir = join(projectRoot, '.claude');
  const claudeSettingsDir = join(claudeDir, 'settings');
  const claudeHooksDir = join(claudeDir, 'hooks');
  const claudeToolsDir = join(claudeDir, 'tools');
  const mcpConfigPath = join(projectRoot, '.mcp.json');
  const gitignorePath = join(projectRoot, '.gitignore');

  // Check if already initialized
  if (!options.force) {
    if (existsSync(codeIndexDir)) {
      result.alreadyExisted.push('.codeindex/');
    }
    if (existsSync(claudeDir)) {
      result.alreadyExisted.push('.claude/');
    }
    if (existsSync(mcpConfigPath)) {
      result.alreadyExisted.push('.mcp.json');
    }

    if (result.alreadyExisted.length > 0) {
      output.info('Project already initialized. Use --force to reinitialize.', {
        existing_paths: result.alreadyExisted
      });
      return result;
    }
  }

  // Create .codeindex directory structure
  if (!existsSync(codeIndexDir)) {
    mkdirSync(codeIndexDir, { recursive: true });
    result.directoriesCreated.push('.codeindex/');
  }

  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
    result.directoriesCreated.push('.codeindex/logs/');
  }

  // Initialize database
  const db = new DatabaseService(projectRoot);
  db.open();

  // Create project configuration
  const projectName = getProjectName(projectRoot);
  const config: ProjectConfiguration = {
    ...DEFAULT_PROJECT_CONFIG,
    id: randomUUID(),
    projectRoot: resolve(projectRoot),
    name: projectName,
    createdAt: new Date()
  } as ProjectConfiguration;

  // Save configuration to database
  db.saveProjectConfig(config);
  db.close();

  output.info('Database initialized', { path: join(codeIndexDir, 'index.db') });

  // Create .claude directory structure
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
    result.directoriesCreated.push('.claude/');
  }

  if (!existsSync(claudeSettingsDir)) {
    mkdirSync(claudeSettingsDir, { recursive: true });
    result.directoriesCreated.push('.claude/settings/');
  }

  if (!existsSync(claudeHooksDir)) {
    mkdirSync(claudeHooksDir, { recursive: true });
    result.directoriesCreated.push('.claude/hooks/');
  }

  if (!existsSync(claudeToolsDir)) {
    mkdirSync(claudeToolsDir, { recursive: true });
    result.directoriesCreated.push('.claude/tools/');
  }

  // Create default settings file
  const settingsPath = join(claudeSettingsDir, 'code-index.json');
  if (!existsSync(settingsPath) || options.force) {
    const defaultSettings = {
      autoIndex: true,
      excludePatterns: [],
      includePatterns: [],
      maxFileSize: 10485760, // 10MB
      followSymlinks: false
    };
    writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    result.filesCreated.push('.claude/settings/code-index.json');
  }

  // Create .mcp.json
  if (!existsSync(mcpConfigPath) || options.force) {
    const mcpConfig = generateMCPConfig(projectRoot);
    writeFileSync(mcpConfigPath, mcpConfigToString(mcpConfig));
    result.filesCreated.push('.mcp.json');
  } else {
    result.alreadyExisted.push('.mcp.json');
  }

  // Update .gitignore
  updateGitignore(gitignorePath, output);

  logger.info('Initialization complete', result);

  return result;
}

/**
 * Gets project name from package.json or directory name
 */
function getProjectName(projectRoot: string): string {
  const packageJsonPath = join(projectRoot, 'package.json');

  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name) {
        return packageJson.name;
      }
    } catch {
      // Fall through to use directory name
    }
  }

  return basename(projectRoot);
}

/**
 * Updates .gitignore to exclude code-index files
 */
function updateGitignore(gitignorePath: string, output: OutputFormatter): void {
  const patternsToAdd = [
    '# Code-index',
    '.codeindex/logs/',
    '.codeindex/*.log',
    '.codeindex/index.db-wal',
    '.codeindex/index.db-shm'
  ];

  let gitignoreContent = '';
  let needsUpdate = false;

  if (existsSync(gitignorePath)) {
    gitignoreContent = readFileSync(gitignorePath, 'utf8');

    // Check if patterns already exist
    for (const pattern of patternsToAdd) {
      if (pattern.startsWith('#')) continue;
      if (!gitignoreContent.includes(pattern)) {
        needsUpdate = true;
        break;
      }
    }
  } else {
    needsUpdate = true;
  }

  if (needsUpdate) {
    // Add a newline if file doesn't end with one
    if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
      gitignoreContent += '\n';
    }

    // Add our patterns
    if (gitignoreContent) {
      gitignoreContent += '\n';
    }
    gitignoreContent += patternsToAdd.join('\n') + '\n';

    writeFileSync(gitignorePath, gitignoreContent);
    output.info('Updated .gitignore');
  }
}