/**
 * ChunkRepository Service
 *
 * Provides data access methods for the chunks table with content-based
 * deduplication and soft-delete support.
 */

import type Database from 'better-sqlite3';
import type { Chunk } from '../models/database-schema.js';

/**
 * Repository class for managing code chunks in the database
 */
export class ChunkRepository {
	private insertStmt: Database.Statement;
	private findByFileStmt: Database.Statement;
	private findBySymbolStmt: Database.Statement;
	private softDeleteStmt: Database.Statement;

	constructor(private db: Database.Database) {
		// Prepare all statements once for performance
		this.insertStmt = db.prepare(`
			INSERT INTO chunks (
				id, file_id, symbol_id, content, context_before,
				context_after, language, line_start, line_end,
				created_at, deleted_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		this.findByFileStmt = db.prepare(`
			SELECT * FROM chunks
			WHERE file_id = ? AND deleted_at IS NULL
			ORDER BY line_start ASC
		`);

		this.findBySymbolStmt = db.prepare(`
			SELECT * FROM chunks
			WHERE symbol_id = ? AND deleted_at IS NULL
			LIMIT 1
		`);

		this.softDeleteStmt = db.prepare(`
			UPDATE chunks
			SET deleted_at = unixepoch()
			WHERE id = ? AND deleted_at IS NULL
		`);
	}

	/**
	 * Insert a new chunk record with content-based ID
	 *
	 * Note: The chunk ID should be generated using generateChunkId()
	 * from chunk-utils.ts before calling this method.
	 *
	 * @param chunk - Chunk data to insert
	 * @returns The ID of the inserted chunk
	 */
	insert(chunk: Chunk): string {
		this.insertStmt.run(
			chunk.id,
			chunk.file_id,
			chunk.symbol_id,
			chunk.content,
			chunk.context_before,
			chunk.context_after,
			chunk.language,
			chunk.line_start,
			chunk.line_end,
			chunk.created_at,
			chunk.deleted_at
		);
		return chunk.id;
	}

	/**
	 * Find all chunks in a file
	 *
	 * @param fileId - File ID to search
	 * @returns Array of chunks in the file (ordered by line_start)
	 */
	findByFile(fileId: string): Chunk[] {
		return this.findByFileStmt.all(fileId) as Chunk[];
	}

	/**
	 * Find the chunk associated with a symbol
	 *
	 * @param symbolId - Symbol ID to search
	 * @returns Chunk associated with the symbol, or null if not found
	 */
	findBySymbol(symbolId: string): Chunk | null {
		const result = this.findBySymbolStmt.get(symbolId) as Chunk | undefined;
		return result ?? null;
	}

	/**
	 * Soft-delete a chunk by setting deleted_at timestamp
	 *
	 * Note: Associated embeddings will be cascade deleted due to
	 * ON DELETE CASCADE foreign key constraint.
	 *
	 * @param chunkId - ID of the chunk to delete
	 */
	softDelete(chunkId: string): void {
		this.softDeleteStmt.run(chunkId);
	}
}
