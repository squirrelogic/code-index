/**
 * Ignore Pattern Storage
 *
 * Manages persistence of ignore patterns in the database.
 * Based on data-model.md specification.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export enum PatternType {
  GLOB = 'glob',
  REGEX = 'regex',
  EXACT = 'exact',
}

export enum PatternSource {
  DEFAULT = 'default',
  GITIGNORE = 'gitignore',
  CONFIG = 'config',
  RUNTIME = 'runtime',
}

export interface IgnorePattern {
  id: string;
  pattern: string;
  type: PatternType;
  source: PatternSource;
  priority: number;
  enabled: boolean;
  matchCount: number;
  lastMatched?: number;
}

export class IgnorePatternStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureSchema();
  }

  /**
   * Ensure database schema exists
   */
  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ignore_patterns (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL UNIQUE,
        type TEXT CHECK(type IN ('glob', 'regex', 'exact')) NOT NULL,
        source TEXT CHECK(source IN ('default', 'gitignore', 'config', 'runtime')) NOT NULL,
        priority INTEGER DEFAULT 500,
        enabled INTEGER DEFAULT 1,
        match_count INTEGER DEFAULT 0,
        last_matched INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_enabled_priority
        ON ignore_patterns(enabled, priority DESC);
    `);
  }

  /**
   * Add a new ignore pattern
   */
  addPattern(
    pattern: string,
    type: PatternType = PatternType.GLOB,
    source: PatternSource = PatternSource.CONFIG,
    priority: number = 500
  ): IgnorePattern {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO ignore_patterns (id, pattern, type, source, priority, enabled, match_count, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?)
    `);

    stmt.run(id, pattern, type, source, priority, now);

    return this.getPatternById(id)!;
  }

  /**
   * Get pattern by ID
   */
  getPatternById(id: string): IgnorePattern | null {
    const stmt = this.db.prepare(`
      SELECT * FROM ignore_patterns WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.rowToPattern(row) : null;
  }

  /**
   * Get pattern by pattern string
   */
  getPatternByString(pattern: string): IgnorePattern | null {
    const stmt = this.db.prepare(`
      SELECT * FROM ignore_patterns WHERE pattern = ?
    `);

    const row = stmt.get(pattern) as any;
    return row ? this.rowToPattern(row) : null;
  }

  /**
   * Get all patterns
   */
  getAllPatterns(enabledOnly: boolean = false): IgnorePattern[] {
    let query = 'SELECT * FROM ignore_patterns';
    if (enabledOnly) {
      query += ' WHERE enabled = 1';
    }
    query += ' ORDER BY priority DESC, created_at ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToPattern(row));
  }

  /**
   * Get patterns by source
   */
  getPatternsBySource(source: PatternSource, enabledOnly: boolean = false): IgnorePattern[] {
    let query = 'SELECT * FROM ignore_patterns WHERE source = ?';
    if (enabledOnly) {
      query += ' AND enabled = 1';
    }
    query += ' ORDER BY priority DESC, created_at ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(source) as any[];
    return rows.map((row) => this.rowToPattern(row));
  }

  /**
   * Update pattern enabled status
   */
  setPatternEnabled(id: string, enabled: boolean): void {
    // Prevent disabling default patterns
    const pattern = this.getPatternById(id);
    if (pattern && pattern.source === PatternSource.DEFAULT) {
      throw new Error('Cannot disable default patterns');
    }

    const stmt = this.db.prepare(`
      UPDATE ignore_patterns SET enabled = ? WHERE id = ?
    `);

    stmt.run(enabled ? 1 : 0, id);
  }

  /**
   * Update pattern priority
   */
  setPatternPriority(id: string, priority: number): void {
    if (priority < 0 || priority > 1000) {
      throw new Error('Priority must be between 0 and 1000');
    }

    const stmt = this.db.prepare(`
      UPDATE ignore_patterns SET priority = ? WHERE id = ?
    `);

    stmt.run(priority, id);
  }

  /**
   * Increment match count for a pattern
   */
  recordMatch(id: string): void {
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      UPDATE ignore_patterns
      SET match_count = match_count + 1, last_matched = ?
      WHERE id = ?
    `);

    stmt.run(now, id);
  }

  /**
   * Remove a pattern
   */
  removePattern(id: string): boolean {
    // Prevent removing default patterns
    const pattern = this.getPatternById(id);
    if (pattern && pattern.source === PatternSource.DEFAULT) {
      throw new Error('Cannot remove default patterns');
    }

    const stmt = this.db.prepare(`
      DELETE FROM ignore_patterns WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Remove all patterns from a source
   */
  removePatternsBySource(source: PatternSource): number {
    if (source === PatternSource.DEFAULT) {
      throw new Error('Cannot remove default patterns');
    }

    const stmt = this.db.prepare(`
      DELETE FROM ignore_patterns WHERE source = ?
    `);

    const result = stmt.run(source);
    return result.changes;
  }

  /**
   * Clear all custom patterns (keeps defaults)
   */
  clearCustomPatterns(): number {
    const stmt = this.db.prepare(`
      DELETE FROM ignore_patterns WHERE source != 'default'
    `);

    const result = stmt.run();
    return result.changes;
  }

  /**
   * Initialize default patterns
   */
  initializeDefaults(patterns: string[]): void {
    // Remove existing defaults first
    const deleteStmt = this.db.prepare(`
      DELETE FROM ignore_patterns WHERE source = 'default'
    `);
    deleteStmt.run();

    // Add new defaults
    for (const pattern of patterns) {
      try {
        this.addPattern(pattern, PatternType.GLOB, PatternSource.DEFAULT, 900);
      } catch (error) {
        // Pattern might already exist, ignore
      }
    }
  }

  /**
   * Convert database row to IgnorePattern
   */
  private rowToPattern(row: any): IgnorePattern {
    return {
      id: row.id,
      pattern: row.pattern,
      type: row.type as PatternType,
      source: row.source as PatternSource,
      priority: row.priority,
      enabled: row.enabled === 1,
      matchCount: row.match_count,
      lastMatched: row.last_matched || undefined,
    };
  }

  /**
   * Get pattern statistics
   */
  getStatistics(): {
    total: number;
    enabled: number;
    bySource: Record<string, number>;
    totalMatches: number;
  } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM ignore_patterns');
    const enabledStmt = this.db.prepare('SELECT COUNT(*) as count FROM ignore_patterns WHERE enabled = 1');
    const sourceStmt = this.db.prepare(`
      SELECT source, COUNT(*) as count
      FROM ignore_patterns
      GROUP BY source
    `);
    const matchesStmt = this.db.prepare('SELECT SUM(match_count) as total FROM ignore_patterns');

    const total = (totalStmt.get() as any).count;
    const enabled = (enabledStmt.get() as any).count;
    const bySourceRows = sourceStmt.all() as any[];
    const totalMatches = (matchesStmt.get() as any).total || 0;

    const bySource: Record<string, number> = {};
    for (const row of bySourceRows) {
      bySource[row.source] = row.count;
    }

    return {
      total,
      enabled,
      bySource,
      totalMatches,
    };
  }
}
