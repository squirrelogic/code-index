/**
 * Query Plan Analyzer
 *
 * Provides utilities for analyzing SQLite query execution plans
 * using EXPLAIN QUERY PLAN to help optimize database queries.
 */

import type Database from 'better-sqlite3';

/**
 * Query plan step from EXPLAIN QUERY PLAN
 */
export interface QueryPlanStep {
	id: number;
	parent: number;
	detail: string;
}

/**
 * Analyzed query plan with performance insights
 */
export interface QueryPlanAnalysis {
	query: string;
	steps: QueryPlanStep[];
	usesIndex: boolean;
	performsScan: boolean;
	indexesUsed: string[];
	warnings: string[];
	recommendations: string[];
}

/**
 * Query Plan Analyzer
 *
 * Analyzes query execution plans and provides optimization recommendations
 */
export class QueryAnalyzer {
	private db: Database.Database;

	constructor(db: Database.Database) {
		this.db = db;
	}

	/**
	 * Get raw query plan from SQLite
	 *
	 * @param query - SQL query to analyze
	 * @returns Array of query plan steps
	 */
	getQueryPlan(query: string): QueryPlanStep[] {
		try {
			const stmt = this.db.prepare(`EXPLAIN QUERY PLAN ${query}`);
			const results = stmt.all() as Array<{
				id: number;
				parent: number;
				notused: number;
				detail: string;
			}>;

			return results.map((row) => ({
				id: row.id,
				parent: row.parent,
				detail: row.detail,
			}));
		} catch (error) {
			throw new Error(
				`Failed to analyze query plan: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Analyze a query and provide performance insights
	 *
	 * @param query - SQL query to analyze
	 * @returns Query plan analysis with recommendations
	 */
	analyzeQuery(query: string): QueryPlanAnalysis {
		const steps = this.getQueryPlan(query);
		const warnings: string[] = [];
		const recommendations: string[] = [];
		const indexesUsed: string[] = [];

		let usesIndex = false;
		let performsScan = false;

		// Analyze each step
		for (const step of steps) {
			const detail = step.detail.toLowerCase();

			// Check for index usage
			if (detail.includes('using index')) {
				usesIndex = true;
				// Extract index name
				const indexMatch = detail.match(/using index (\w+)/);
				if (indexMatch && indexMatch[1]) {
					indexesUsed.push(indexMatch[1]);
				}
			}

			// Check for table scans
			if (detail.includes('scan table') || detail.includes('scan ')) {
				performsScan = true;
				warnings.push(`Table scan detected: ${step.detail}`);

				// Check if it's a full table scan without index
				if (!detail.includes('using index')) {
					recommendations.push(
						`Consider adding an index for: ${step.detail.match(/scan table (\w+)/)?.[1] || 'this table'}`
					);
				}
			}

			// Check for temporary b-trees
			if (detail.includes('use temp b-tree')) {
				warnings.push(`Temporary B-tree created: ${step.detail}`);
				recommendations.push(
					'Consider adding an ORDER BY index or optimizing the query to avoid temporary sorting'
				);
			}

			// Check for subqueries
			if (detail.includes('execute correlated scalar subquery')) {
				warnings.push(`Correlated subquery detected: ${step.detail}`);
				recommendations.push(
					'Consider rewriting correlated subquery as a JOIN for better performance'
				);
			}

			// Check for cartesian products
			if (detail.includes('cartesian') || detail.includes('cross join')) {
				warnings.push(`Cartesian product detected: ${step.detail}`);
				recommendations.push(
					'Add JOIN conditions to avoid cartesian product (cross join of all rows)'
				);
			}
		}

		// Additional recommendations based on analysis
		if (!usesIndex && steps.length > 0) {
			recommendations.push(
				'Query does not use any indexes - consider adding appropriate indexes'
			);
		}

		return {
			query,
			steps,
			usesIndex,
			performsScan,
			indexesUsed,
			warnings,
			recommendations,
		};
	}

	/**
	 * Format query plan analysis as a human-readable report
	 *
	 * @param analysis - Query plan analysis
	 * @returns Formatted report string
	 */
	formatAnalysisReport(analysis: QueryPlanAnalysis): string {
		const lines: string[] = [];

		lines.push('='.repeat(80));
		lines.push('QUERY PLAN ANALYSIS');
		lines.push('='.repeat(80));
		lines.push('');

		// Query
		lines.push('QUERY:');
		lines.push(`  ${analysis.query}`);
		lines.push('');

		// Summary
		lines.push('SUMMARY:');
		lines.push(`  Uses Index: ${analysis.usesIndex ? 'Yes' : 'No'}`);
		lines.push(`  Performs Scan: ${analysis.performsScan ? 'Yes' : 'No'}`);
		if (analysis.indexesUsed.length > 0) {
			lines.push(`  Indexes Used: ${analysis.indexesUsed.join(', ')}`);
		}
		lines.push('');

		// Query plan steps
		lines.push('EXECUTION PLAN:');
		for (const step of analysis.steps) {
			const indent = '  '.repeat(step.parent + 1);
			lines.push(`${indent}[${step.id}] ${step.detail}`);
		}
		lines.push('');

		// Warnings
		if (analysis.warnings.length > 0) {
			lines.push('WARNINGS:');
			for (const warning of analysis.warnings) {
				lines.push(`  ⚠️  ${warning}`);
			}
			lines.push('');
		}

		// Recommendations
		if (analysis.recommendations.length > 0) {
			lines.push('RECOMMENDATIONS:');
			for (const recommendation of analysis.recommendations) {
				lines.push(`  💡 ${recommendation}`);
			}
			lines.push('');
		}

		lines.push('='.repeat(80));

		return lines.join('\n');
	}

	/**
	 * Batch analyze multiple queries
	 *
	 * @param queries - Array of queries to analyze
	 * @returns Array of query plan analyses
	 */
	analyzeQueries(queries: string[]): QueryPlanAnalysis[] {
		return queries.map((query) => this.analyzeQuery(query));
	}

	/**
	 * Get query optimization score (0-100)
	 * Higher is better
	 *
	 * @param analysis - Query plan analysis
	 * @returns Score from 0-100
	 */
	getOptimizationScore(analysis: QueryPlanAnalysis): number {
		let score = 100;

		// Deduct points for issues
		if (!analysis.usesIndex) {
			score -= 30;
		}

		if (analysis.performsScan) {
			score -= 20;
		}

		score -= analysis.warnings.length * 10;

		// Ensure score doesn't go below 0
		return Math.max(0, score);
	}

	/**
	 * Compare two queries to see which is more efficient
	 *
	 * @param query1 - First query
	 * @param query2 - Second query
	 * @returns Comparison result
	 */
	compareQueries(
		query1: string,
		query2: string
	): {
		query1Score: number;
		query2Score: number;
		winner: 'query1' | 'query2' | 'tie';
		analysis1: QueryPlanAnalysis;
		analysis2: QueryPlanAnalysis;
	} {
		const analysis1 = this.analyzeQuery(query1);
		const analysis2 = this.analyzeQuery(query2);

		const query1Score = this.getOptimizationScore(analysis1);
		const query2Score = this.getOptimizationScore(analysis2);

		let winner: 'query1' | 'query2' | 'tie';
		if (query1Score > query2Score) {
			winner = 'query1';
		} else if (query2Score > query1Score) {
			winner = 'query2';
		} else {
			winner = 'tie';
		}

		return {
			query1Score,
			query2Score,
			winner,
			analysis1,
			analysis2,
		};
	}
}
