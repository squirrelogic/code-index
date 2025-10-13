/**
 * SearchService
 *
 * Provides full-text search capabilities using SQLite FTS5 with BM25 ranking,
 * snippet generation, and performance monitoring.
 */

import type Database from 'better-sqlite3';
import type { SearchResult } from '../models/database-schema.js';

/**
 * Configuration options for snippet generation
 */
export interface SnippetOptions {
	/** Token to mark start of match (default: '[') */
	startMarker?: string;
	/** Token to mark end of match (default: ']') */
	endMarker?: string;
	/** Ellipsis for truncated content (default: '...') */
	ellipsis?: string;
	/** Maximum number of tokens in snippet (default: 32) */
	maxTokens?: number;
}

/**
 * Service class for full-text search operations
 */
export class SearchService {
	private indexContentStmt: Database.Statement;
	private searchStmt: Database.Statement;
	private searchPhraseStmt: Database.Statement;
	private searchPrefixStmt: Database.Statement;
	private searchWithWeightsStmt: Database.Statement;

	constructor(private db: Database.Database) {
		// Prepare all statements once for performance
		this.indexContentStmt = db.prepare(`
			INSERT INTO search (content, documentation, file_id, symbol_id, file_path)
			VALUES (?, ?, ?, ?, ?)
		`);

		this.searchStmt = db.prepare(`
			SELECT
				file_id,
				symbol_id,
				file_path,
				snippet(search, 0, ?, ?, ?, ?) AS snippet,
				bm25(search) AS rank
			FROM search
			WHERE search MATCH ?
			ORDER BY rank
			LIMIT ?
		`);

		this.searchPhraseStmt = db.prepare(`
			SELECT
				file_id,
				symbol_id,
				file_path,
				snippet(search, 0, ?, ?, ?, ?) AS snippet,
				bm25(search) AS rank
			FROM search
			WHERE search MATCH ?
			ORDER BY rank
			LIMIT ?
		`);

		this.searchPrefixStmt = db.prepare(`
			SELECT
				file_id,
				symbol_id,
				file_path,
				snippet(search, 0, ?, ?, ?, ?) AS snippet,
				bm25(search) AS rank
			FROM search
			WHERE search MATCH ?
			ORDER BY rank
			LIMIT ?
		`);

		// Custom weighted search: bm25(search, content_weight, docs_weight)
		this.searchWithWeightsStmt = db.prepare(`
			SELECT
				file_id,
				symbol_id,
				file_path,
				snippet(search, 0, ?, ?, ?, ?) AS snippet,
				bm25(search, ?, ?) AS rank
			FROM search
			WHERE search MATCH ?
			ORDER BY rank
			LIMIT ?
		`);
	}

	/**
	 * Index content into the FTS5 search table
	 * @param fileId - File identifier
	 * @param symbolId - Symbol identifier (optional)
	 * @param content - Code content to index
	 * @param documentation - Documentation/comments (optional)
	 * @param filePath - File path for display
	 */
	indexContent(
		fileId: string,
		symbolId: string | null,
		content: string,
		documentation: string | null,
		filePath: string
	): void {
		this.indexContentStmt.run(content, documentation, fileId, symbolId, filePath);
	}

	/**
	 * Perform a keyword search with BM25 ranking
	 * @param query - Search query (FTS5 syntax)
	 * @param limit - Maximum number of results (default: 100)
	 * @param snippetOptions - Snippet generation options
	 * @returns Array of search results with snippets and ranks
	 */
	search(query: string, limit: number = 100, snippetOptions?: SnippetOptions): SearchResult[] {
		const opts = this.getSnippetOptions(snippetOptions);
		const start = performance.now();

		const results = this.searchStmt.all(
			opts.startMarker,
			opts.endMarker,
			opts.ellipsis,
			opts.maxTokens,
			query,
			limit
		) as SearchResult[];

		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('search', duration, results.length, { query, limit });
		}

		return results;
	}

	/**
	 * Perform an exact phrase search
	 * @param phrase - Exact phrase to search for
	 * @param limit - Maximum number of results (default: 100)
	 * @param snippetOptions - Snippet generation options
	 * @returns Array of search results
	 */
	searchPhrase(phrase: string, limit: number = 100, snippetOptions?: SnippetOptions): SearchResult[] {
		const opts = this.getSnippetOptions(snippetOptions);
		// FTS5 phrase syntax: wrap in double quotes
		const phraseQuery = `"${phrase}"`;
		const start = performance.now();

		const results = this.searchPhraseStmt.all(
			opts.startMarker,
			opts.endMarker,
			opts.ellipsis,
			opts.maxTokens,
			phraseQuery,
			limit
		) as SearchResult[];

		const duration = performance.now() - start;

		if (duration > 100) {
			this.logSlowQuery('searchPhrase', duration, results.length, { phrase, limit });
		}

		return results;
	}

	/**
	 * Perform a prefix/autocomplete search
	 * @param prefix - Prefix to search for
	 * @param limit - Maximum number of results (default: 100)
	 * @param snippetOptions - Snippet generation options
	 * @returns Array of search results
	 */
	searchPrefix(prefix: string, limit: number = 100, snippetOptions?: SnippetOptions): SearchResult[] {
		const opts = this.getSnippetOptions(snippetOptions);
		// FTS5 prefix syntax: append asterisk
		const prefixQuery = `${prefix}*`;
		const start = performance.now();

		const results = this.searchPrefixStmt.all(
			opts.startMarker,
			opts.endMarker,
			opts.ellipsis,
			opts.maxTokens,
			prefixQuery,
			limit
		) as SearchResult[];

		const duration = performance.now() - start;

		if (duration > 100) {
			this.logSlowQuery('searchPrefix', duration, results.length, { prefix, limit });
		}

		return results;
	}

	/**
	 * Perform a search with custom column weights
	 * @param query - Search query
	 * @param contentWeight - Weight for content column (default: 2.0)
	 * @param docsWeight - Weight for documentation column (default: 1.0)
	 * @param limit - Maximum number of results (default: 100)
	 * @param snippetOptions - Snippet generation options
	 * @returns Array of search results
	 */
	searchWithWeights(
		query: string,
		contentWeight: number = 2.0,
		docsWeight: number = 1.0,
		limit: number = 100,
		snippetOptions?: SnippetOptions
	): SearchResult[] {
		const opts = this.getSnippetOptions(snippetOptions);
		const start = performance.now();

		const results = this.searchWithWeightsStmt.all(
			opts.startMarker,
			opts.endMarker,
			opts.ellipsis,
			opts.maxTokens,
			contentWeight,
			docsWeight,
			query,
			limit
		) as SearchResult[];

		const duration = performance.now() - start;

		if (duration > 100) {
			this.logSlowQuery('searchWithWeights', duration, results.length, {
				query,
				contentWeight,
				docsWeight,
				limit,
			});
		}

		return results;
	}

	/**
	 * Batch index multiple content entries in a single transaction
	 * @param entries - Array of content entries to index
	 */
	batchIndex(
		entries: Array<{
			fileId: string;
			symbolId: string | null;
			content: string;
			documentation: string | null;
			filePath: string;
		}>
	): void {
		const transaction = this.db.transaction(() => {
			for (const entry of entries) {
				this.indexContent(entry.fileId, entry.symbolId, entry.content, entry.documentation, entry.filePath);
			}
		});

		transaction();
	}

	/**
	 * Get snippet options with defaults
	 * @private
	 */
	private getSnippetOptions(options?: SnippetOptions): Required<SnippetOptions> {
		return {
			startMarker: options?.startMarker ?? '[',
			endMarker: options?.endMarker ?? ']',
			ellipsis: options?.ellipsis ?? '...',
			maxTokens: options?.maxTokens ?? 32,
		};
	}

	/**
	 * Log slow queries for performance monitoring
	 * @private
	 */
	private logSlowQuery(operation: string, duration: number, resultCount: number, params: Record<string, any>): void {
		const logEntry = {
			type: 'slow_query',
			service: 'SearchService',
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
