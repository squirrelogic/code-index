/**
 * Type of file system change detected
 */
export enum FileChangeType {
  CREATE = 'create',
  MODIFY = 'modify',
  DELETE = 'delete',
  RENAME = 'rename'
}

/**
 * Processing status of a file change event
 */
export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * Represents a detected file system change event
 */
export interface FileChangeEvent {
  /**
   * Unique identifier for deduplication
   */
  id: string;

  /**
   * Relative path from project root
   */
  path: string;

  /**
   * Resolved canonical path (follows symlinks)
   */
  canonicalPath: string;

  /**
   * Type of change detected
   */
  type: FileChangeType;

  /**
   * Unix timestamp when detected
   */
  timestamp: number;

  /**
   * Current processing status
   */
  status: ProcessingStatus;

  /**
   * Number of retry attempts
   */
  retryCount: number;

  /**
   * Last error if processing failed
   */
  error?: string;

  /**
   * File size in bytes
   */
  size?: number;

  /**
   * Whether path is a directory
   */
  isDirectory: boolean;

  /**
   * Whether path is a symlink
   */
  isSymlink: boolean;

  /**
   * Old path for rename events
   */
  oldPath?: string;

  /**
   * Old canonical path for rename events
   */
  oldCanonicalPath?: string;
}

/**
 * Creates a new FileChangeEvent
 * @param type Type of change
 * @param path Relative file path
 * @param canonicalPath Canonical file path
 * @param options Additional options
 * @returns New FileChangeEvent instance
 */
export function createFileChangeEvent(
  type: FileChangeType,
  path: string,
  canonicalPath: string,
  options?: Partial<FileChangeEvent>
): FileChangeEvent {
  return {
    id: generateEventId(),
    path,
    canonicalPath,
    type,
    timestamp: Date.now(),
    status: ProcessingStatus.PENDING,
    retryCount: 0,
    isDirectory: false,
    isSymlink: false,
    ...options
  };
}

/**
 * Generates a unique event ID
 * @returns Unique identifier string
 */
function generateEventId(): string {
  // Simple ID generation using timestamp and random component
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${random}`;
}

/**
 * Validates a FileChangeEvent
 * @param event Event to validate
 * @throws Error if event is invalid
 */
export function validateFileChangeEvent(event: FileChangeEvent): void {
  if (!event.id) {
    throw new Error('Event ID is required');
  }

  if (!event.path) {
    throw new Error('Event path is required');
  }

  if (!event.canonicalPath) {
    throw new Error('Event canonical path is required');
  }

  if (!Object.values(FileChangeType).includes(event.type)) {
    throw new Error(`Invalid event type: ${event.type}`);
  }

  if (!Object.values(ProcessingStatus).includes(event.status)) {
    throw new Error(`Invalid event status: ${event.status}`);
  }

  if (event.timestamp <= 0) {
    throw new Error('Event timestamp must be positive');
  }

  if (event.retryCount < 0) {
    throw new Error('Retry count cannot be negative');
  }

  if (event.retryCount > 3) {
    throw new Error('Retry count exceeds maximum (3)');
  }

  if (event.size !== undefined && event.size < 0) {
    throw new Error('File size cannot be negative');
  }

  if (event.type === FileChangeType.RENAME) {
    if (!event.oldPath) {
      throw new Error('Rename events must include oldPath');
    }
    if (!event.oldCanonicalPath) {
      throw new Error('Rename events must include oldCanonicalPath');
    }
  }
}

/**
 * Determines if an event should be retried
 * @param event Event to check
 * @returns True if event can be retried
 */
export function canRetryEvent(event: FileChangeEvent): boolean {
  return (
    event.status === ProcessingStatus.FAILED &&
    event.retryCount < 3
  );
}

/**
 * Merges multiple events for the same file
 * @param events Array of events to merge
 * @returns Merged event or null if no events
 */
export function mergeFileChangeEvents(events: FileChangeEvent[]): FileChangeEvent | null {
  if (events.length === 0) {
    return null;
  }

  if (events.length === 1) {
    return events[0] || null;
  }

  // Sort by timestamp
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // Apply coalescing rules
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (!first || !last) {
    return null;
  }

  // Rule: CREATE followed by DELETE = no operation
  if (first.type === FileChangeType.CREATE && last.type === FileChangeType.DELETE) {
    return null;
  }

  // Rule: Multiple MODIFY = single MODIFY
  if (events.every(e => e.type === FileChangeType.MODIFY)) {
    return {
      ...last,
      timestamp: first.timestamp // Keep earliest timestamp
    };
  }

  // Rule: CREATE followed by MODIFY = CREATE
  if (first.type === FileChangeType.CREATE && last.type === FileChangeType.MODIFY) {
    return first;
  }

  // Rule: MODIFY followed by DELETE = DELETE
  if (first.type === FileChangeType.MODIFY && last.type === FileChangeType.DELETE) {
    return last;
  }

  // Default: return the last event
  return last;
}

/**
 * Groups events by canonical path
 * @param events Array of events to group
 * @returns Map of canonical path to events
 */
export function groupEventsByPath(
  events: FileChangeEvent[]
): Map<string, FileChangeEvent[]> {
  const groups = new Map<string, FileChangeEvent[]>();

  for (const event of events) {
    const key = event.canonicalPath;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }

  return groups;
}

/**
 * Filters events to get only the latest for each file
 * @param events Array of events to filter
 * @returns Array of latest events per file
 */
export function getLatestEvents(events: FileChangeEvent[]): FileChangeEvent[] {
  const groups = groupEventsByPath(events);
  const latest: FileChangeEvent[] = [];

  for (const [, groupEvents] of groups) {
    const merged = mergeFileChangeEvents(groupEvents);
    if (merged) {
      latest.push(merged);
    }
  }

  return latest;
}