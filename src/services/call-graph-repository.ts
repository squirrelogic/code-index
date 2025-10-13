/**
 * CallGraphRepository Service
 *
 * Provides data access methods for the calls table with support for
 * call graph traversal, cycle detection, and performance monitoring.
 */

import type Database from 'better-sqlite3';
import type {
	Call,
	CallGraph,
	CallGraphNode,
	SymbolType,
} from '../models/database-schema.js';

/**
 * Repository class for managing function/method call relationships
 */
export class CallGraphRepository {
	private db: Database.Database;
	private insertStmt: Database.Statement;
	private findCalleesStmt: Database.Statement;
	private findCallersStmt: Database.Statement;
	private findByTypeStmt: Database.Statement;

	constructor(db: Database.Database) {
		this.db = db;

		// Prepare all statements once for performance
		this.insertStmt = db.prepare(`
			INSERT INTO calls (
				caller_symbol_id, callee_symbol_id, call_type,
				context, line_number, created_at
			) VALUES (?, ?, ?, ?, ?, ?)
		`);

		this.findCalleesStmt = db.prepare(`
			SELECT * FROM calls
			WHERE caller_symbol_id = ?
		`);

		this.findCallersStmt = db.prepare(`
			SELECT * FROM calls
			WHERE callee_symbol_id = ?
		`);

		this.findByTypeStmt = db.prepare(`
			SELECT * FROM calls
			WHERE call_type = ?
		`);
	}

	/**
	 * Create a new call relationship
	 * @param call - Call data to insert
	 * @returns The ID of the inserted call
	 */
	insert(call: Omit<Call, 'id'>): number {
		const result = this.insertStmt.run(
			call.caller_symbol_id,
			call.callee_symbol_id,
			call.call_type,
			call.context,
			call.line_number,
			call.created_at
		);
		return result.lastInsertRowid as number;
	}

	/**
	 * Find all functions called BY a given symbol (with performance target <100ms)
	 * @param callerSymbolId - ID of the caller symbol
	 * @returns Array of call relationships
	 */
	findCallees(callerSymbolId: string): Call[] {
		const start = performance.now();
		const results = this.findCalleesStmt.all(callerSymbolId) as Call[];
		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findCallees', duration, results.length, { callerSymbolId });
		}

		return results;
	}

	/**
	 * Find all functions that call a given symbol (with performance target <100ms)
	 * @param calleeSymbolId - ID of the callee symbol
	 * @returns Array of call relationships
	 */
	findCallers(calleeSymbolId: string): Call[] {
		const start = performance.now();
		const results = this.findCallersStmt.all(calleeSymbolId) as Call[];
		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findCallers', duration, results.length, { calleeSymbolId });
		}

		return results;
	}

	/**
	 * Find call relationships by type (e.g., 'direct', 'indirect')
	 * @param callType - Type of call relationship
	 * @returns Array of matching call relationships
	 */
	findByType(callType: string): Call[] {
		const start = performance.now();
		const results = this.findByTypeStmt.all(callType) as Call[];
		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findByType', duration, results.length, { callType });
		}

		return results;
	}

	/**
	 * Build a transitive call graph starting from a symbol
	 * Uses recursive traversal with cycle detection
	 *
	 * @param symbolId - Root symbol ID to start traversal
	 * @param maxDepth - Maximum depth to traverse (default: 10)
	 * @returns Complete call graph structure with cycle information
	 */
	findCallGraph(symbolId: string, maxDepth: number = 10): CallGraph {
		const start = performance.now();

		// Track visited nodes to detect cycles
		const visited = new Set<string>();
		const currentPath = new Set<string>();
		const cyclePaths: string[][] = [];

		// Get symbol information for the root
		const rootSymbol = this.getSymbolInfo(symbolId);
		if (!rootSymbol) {
			throw new Error(`Symbol not found: ${symbolId}`);
		}

		// Build the graph recursively
		const root = this.buildCallGraphNode(
			symbolId,
			0,
			maxDepth,
			visited,
			currentPath,
			cyclePaths
		);

		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findCallGraph', duration, visited.size, {
				symbolId,
				maxDepth,
				cyclesDetected: cyclePaths.length,
			});
		}

		return {
			root_symbol_id: symbolId,
			max_depth: maxDepth,
			root,
			has_cycles: cyclePaths.length > 0,
			cycle_paths: cyclePaths,
		};
	}

	/**
	 * Build a call graph node recursively
	 * @private
	 */
	private buildCallGraphNode(
		symbolId: string,
		depth: number,
		maxDepth: number,
		visited: Set<string>,
		currentPath: Set<string>,
		cyclePaths: string[][]
	): CallGraphNode {
		// Get symbol information
		const symbolInfo = this.getSymbolInfo(symbolId);
		if (!symbolInfo) {
			throw new Error(`Symbol not found: ${symbolId}`);
		}

		// Check if we've reached max depth
		if (depth >= maxDepth) {
			return {
				symbol_id: symbolId,
				symbol_name: symbolInfo.symbol_name,
				symbol_type: symbolInfo.symbol_type,
				depth,
				callees: [],
				has_cycle: false,
			};
		}

		// Check for cycle detection
		if (currentPath.has(symbolId)) {
			// Cycle detected - capture the path
			const pathArray = Array.from(currentPath);
			const cycleStartIndex = pathArray.indexOf(symbolId);
			const cyclePath = [...pathArray.slice(cycleStartIndex), symbolId];
			cyclePaths.push(cyclePath);

			return {
				symbol_id: symbolId,
				symbol_name: symbolInfo.symbol_name,
				symbol_type: symbolInfo.symbol_type,
				depth,
				callees: [],
				has_cycle: true,
			};
		}

		// Mark as visited and add to current path
		visited.add(symbolId);
		currentPath.add(symbolId);

		// Get all callees for this symbol
		const calls = this.findCallees(symbolId);
		const callees: CallGraphNode[] = [];

		for (const call of calls) {
			try {
				const calleeNode = this.buildCallGraphNode(
					call.callee_symbol_id,
					depth + 1,
					maxDepth,
					visited,
					currentPath,
					cyclePaths
				);
				callees.push(calleeNode);
			} catch (error) {
				// Skip symbols that don't exist (possibly deleted)
				continue;
			}
		}

		// Remove from current path (backtrack)
		currentPath.delete(symbolId);

		return {
			symbol_id: symbolId,
			symbol_name: symbolInfo.symbol_name,
			symbol_type: symbolInfo.symbol_type,
			depth,
			callees,
			has_cycle: false,
		};
	}

	/**
	 * Get symbol information for a given symbol ID
	 * @private
	 */
	private getSymbolInfo(
		symbolId: string
	): { symbol_name: string; symbol_type: SymbolType } | null {
		const stmt = this.db.prepare(`
			SELECT symbol_name, symbol_type
			FROM symbols
			WHERE id = ? AND deleted_at IS NULL
		`);

		const result = stmt.get(symbolId) as
			| { symbol_name: string; symbol_type: SymbolType }
			| undefined;

		return result ?? null;
	}

	/**
	 * Find circular dependencies using a simpler query approach
	 * This is an alternative to the recursive approach, useful for reporting
	 *
	 * @returns Array of cycle paths detected
	 */
	findCircularDependencies(): string[][] {
		// Use recursive CTE to detect cycles
		const query = `
			WITH RECURSIVE call_chain(caller_id, callee_id, path, cycle) AS (
				-- Base case: all direct calls
				SELECT
					caller_symbol_id,
					callee_symbol_id,
					caller_symbol_id || ' -> ' || callee_symbol_id,
					0
				FROM calls

				UNION ALL

				-- Recursive case: extend the chain
				SELECT
					cc.caller_id,
					c.callee_symbol_id,
					cc.path || ' -> ' || c.callee_symbol_id,
					CASE
						WHEN c.callee_symbol_id = cc.caller_id THEN 1
						WHEN instr(cc.path, c.callee_symbol_id) > 0 THEN 1
						ELSE 0
					END
				FROM call_chain cc
				JOIN calls c ON cc.callee_id = c.caller_symbol_id
				WHERE cc.cycle = 0
				  AND length(cc.path) < 1000  -- Prevent infinite loops
			)
			SELECT DISTINCT path
			FROM call_chain
			WHERE cycle = 1
			ORDER BY path
		`;

		const start = performance.now();
		const results = this.db.prepare(query).all() as Array<{ path: string }>;
		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findCircularDependencies', duration, results.length, {});
		}

		// Convert path strings to arrays
		return results.map((row) => row.path.split(' -> '));
	}

	/**
	 * Log slow queries for performance monitoring
	 * @private
	 */
	private logSlowQuery(
		operation: string,
		duration: number,
		resultCount: number,
		params: Record<string, any>
	): void {
		const logEntry = {
			type: 'slow_query',
			service: 'CallGraphRepository',
			operation,
			duration_ms: Math.round(duration),
			result_count: resultCount,
			threshold_ms: 100,
			parameters: params,
			timestamp: new Date().toISOString(),
		};

		// Log to console for now (can be extended to write to file)
		console.warn('[SLOW QUERY]', JSON.stringify(logEntry));
	}
}
