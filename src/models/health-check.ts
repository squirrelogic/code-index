/**
 * Health check result for system diagnostics
 */
export interface HealthCheckResult {
  status: HealthStatus; // Overall health status
  timestamp: Date; // When check was performed
  components: ComponentStatus[]; // Individual component statuses
  issues: HealthIssue[]; // Detected issues
  suggestions: string[]; // Suggested fixes
  canAutoFix: boolean; // Whether issues can be auto-fixed
}

/**
 * Overall health status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Individual component status
 */
export interface ComponentStatus {
  name: string; // Component name
  status: HealthStatus; // Component health status
  message: string; // Status message
  details?: Record<string, any>; // Additional details
  checkDurationMs: number; // How long the check took
}

/**
 * Health issue detected during check
 */
export interface HealthIssue {
  severity: IssueSeverity; // Issue severity
  component: string; // Affected component
  code: string; // Issue code for programmatic handling
  message: string; // Human-readable message
  details?: Record<string, any>; // Additional details
  fixable: boolean; // Whether this can be auto-fixed
  fixCommand?: string; // Command to fix the issue
}

/**
 * Issue severity levels
 */
export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Common health check issue codes
 */
export enum IssueCode {
  // Database issues
  DB_NOT_FOUND = 'DB_NOT_FOUND',
  DB_CORRUPTED = 'DB_CORRUPTED',
  DB_VERSION_MISMATCH = 'DB_VERSION_MISMATCH',
  DB_LOCKED = 'DB_LOCKED',
  DB_PERMISSION_DENIED = 'DB_PERMISSION_DENIED',

  // Directory issues
  DIR_NOT_FOUND = 'DIR_NOT_FOUND',
  DIR_PERMISSION_DENIED = 'DIR_PERMISSION_DENIED',
  DIR_NOT_WRITABLE = 'DIR_NOT_WRITABLE',

  // Configuration issues
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_VERSION_MISMATCH = 'CONFIG_VERSION_MISMATCH',

  // Index issues
  INDEX_OUTDATED = 'INDEX_OUTDATED',
  INDEX_EMPTY = 'INDEX_EMPTY',
  INDEX_CORRUPTED = 'INDEX_CORRUPTED',

  // System issues
  DISK_SPACE_LOW = 'DISK_SPACE_LOW',
  MEMORY_LOW = 'MEMORY_LOW',
  NODE_VERSION_UNSUPPORTED = 'NODE_VERSION_UNSUPPORTED'
}

/**
 * Component names for health checks
 */
export enum ComponentName {
  DATABASE = 'Database',
  FILE_SYSTEM = 'File System',
  CONFIGURATION = 'Configuration',
  INDEX = 'Index',
  LOGGING = 'Logging',
  PERMISSIONS = 'Permissions',
  DEPENDENCIES = 'Dependencies',
  SYSTEM = 'System'
}

/**
 * Creates a healthy component status
 */
export function healthyComponent(
  name: string,
  message: string = 'OK',
  checkDurationMs: number = 0
): ComponentStatus {
  return {
    name,
    status: HealthStatus.HEALTHY,
    message,
    checkDurationMs
  };
}

/**
 * Creates an error component status
 */
export function errorComponent(
  name: string,
  message: string,
  details?: Record<string, any>,
  checkDurationMs: number = 0
): ComponentStatus {
  return {
    name,
    status: HealthStatus.ERROR,
    message,
    details,
    checkDurationMs
  };
}

/**
 * Determines overall health status from component statuses
 */
export function calculateOverallHealth(components: ComponentStatus[]): HealthStatus {
  const statuses = components.map(c => c.status);

  if (statuses.includes(HealthStatus.CRITICAL)) {
    return HealthStatus.CRITICAL;
  }
  if (statuses.includes(HealthStatus.ERROR)) {
    return HealthStatus.ERROR;
  }
  if (statuses.includes(HealthStatus.WARNING)) {
    return HealthStatus.WARNING;
  }
  return HealthStatus.HEALTHY;
}

/**
 * Creates a health issue
 */
export function createIssue(
  severity: IssueSeverity,
  component: string,
  code: string,
  message: string,
  fixable: boolean = false,
  fixCommand?: string
): HealthIssue {
  return {
    severity,
    component,
    code,
    message,
    fixable,
    fixCommand
  };
}

/**
 * Common fix suggestions
 */
export const FIX_SUGGESTIONS: Partial<Record<IssueCode, string>> = {
  [IssueCode.DB_NOT_FOUND]: 'Run "code-index init" to initialize the database',
  [IssueCode.DB_CORRUPTED]: 'Run "code-index init --force" to reinitialize',
  [IssueCode.DB_VERSION_MISMATCH]: 'Run "code-index init --force" to reinitialize with current version',
  [IssueCode.DB_LOCKED]: 'Ensure no other processes are accessing the database',
  [IssueCode.DB_PERMISSION_DENIED]: 'Check file permissions for .codeindex/index.db',
  [IssueCode.DIR_NOT_FOUND]: 'Run "code-index init" to create required directories',
  [IssueCode.DIR_PERMISSION_DENIED]: 'Check directory permissions for .codeindex/',
  [IssueCode.DIR_NOT_WRITABLE]: 'Check write permissions for .codeindex/',
  [IssueCode.CONFIG_INVALID]: 'Fix configuration issues or run "code-index init --force"',
  [IssueCode.CONFIG_MISSING]: 'Run "code-index init" to create configuration',
  [IssueCode.CONFIG_VERSION_MISMATCH]: 'Run "code-index init --force" to update configuration',
  [IssueCode.INDEX_OUTDATED]: 'Run "code-index refresh" to update the index',
  [IssueCode.INDEX_EMPTY]: 'Run "code-index index" to build the index',
  [IssueCode.INDEX_CORRUPTED]: 'Run "code-index index --force" to rebuild the index',
  [IssueCode.DISK_SPACE_LOW]: 'Free up disk space (at least 100MB required)',
  [IssueCode.MEMORY_LOW]: 'Close other applications to free up memory',
  [IssueCode.NODE_VERSION_UNSUPPORTED]: 'Update Node.js to version 20 or higher'
};