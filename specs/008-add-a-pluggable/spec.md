# Feature Specification: Pluggable Embedding Layer

**Feature Branch**: `008-add-a-pluggable`
**Created**: 2025-01-12
**Status**: Draft
**Input**: User description: "Add a pluggable embedding layer supporting local or hosted models via adapters. Re-embed only when chunk.hash changes. Store vectors in SQLite (VSS/ANN or cosine table) with model/version tags. Provide --embed model=name override and a dry-run mode."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Embedding Generation with Default Model (Priority: P1)

A developer wants to generate embeddings for their codebase using the default embedding model without any configuration.

**Why this priority**: This is the core functionality that enables semantic search and code understanding. Without basic embedding generation, no other features can function.

**Independent Test**: Can be tested by running the embedding command on a sample codebase and verifying that vector representations are generated and stored successfully.

**Acceptance Scenarios**:

1. **Given** a codebase with multiple files, **When** the user runs the embedding command, **Then** embeddings are generated for all code chunks using the default model
2. **Given** existing code chunks without embeddings, **When** the embedding process runs, **Then** vectors are stored with appropriate model and version tags
3. **Given** a successful embedding run, **When** the user queries the storage, **Then** they can retrieve vectors with their associated metadata

---

### User Story 2 - Incremental Re-embedding Based on Changes (Priority: P1)

A developer modifies some files in their codebase and wants to re-embed only the changed portions, avoiding unnecessary recomputation.

**Why this priority**: Critical for performance and efficiency. Re-embedding entire codebases on every change would be prohibitively expensive for large projects.

**Independent Test**: Can be tested by modifying specific files, running the embedding command, and verifying that only chunks with changed hashes are re-embedded.

**Acceptance Scenarios**:

1. **Given** a codebase with existing embeddings, **When** no files have changed, **Then** the embedding process skips all chunks and reports no updates needed
2. **Given** a codebase where some files are modified, **When** the embedding process runs, **Then** only chunks with changed hashes are re-embedded
3. **Given** a file is deleted from the codebase, **When** the embedding process runs, **Then** embeddings for chunks from that file are removed from storage

---

### User Story 3 - Model Selection Override (Priority: P2)

A power user wants to use a specific embedding model instead of the default, either for better quality or different embedding dimensions.

**Why this priority**: Enables flexibility for users with specific requirements while maintaining backward compatibility with the default configuration.

**Independent Test**: Can be tested by running the embed command with different model overrides and verifying that the specified models are used.

**Acceptance Scenarios**:

1. **Given** multiple embedding models are available, **When** the user runs `--embed model=specific-model`, **Then** the specified model is used for embedding generation
2. **Given** an invalid model name is provided, **When** the user runs the embed command, **Then** a clear error message lists available models
3. **Given** embeddings exist from a different model, **When** using a new model override, **Then** all chunks are re-embedded with the new model

---

### User Story 4 - Dry-Run Mode for Planning (Priority: P2)

A developer wants to preview what would be embedded without actually performing the computation, useful for understanding the scope of changes.

**Why this priority**: Helps users understand the impact of their actions before committing resources, especially important for large codebases or expensive models.

**Independent Test**: Can be tested by running the embed command with dry-run flag and verifying that no actual embeddings are generated but a detailed report is provided.

**Acceptance Scenarios**:

1. **Given** a codebase with no embeddings, **When** the user runs with dry-run mode, **Then** the system reports how many chunks would be embedded without performing the operation
2. **Given** a codebase with existing embeddings and some changes, **When** dry-run mode is used, **Then** the system reports which chunks would be re-embedded and which would be skipped
3. **Given** a model override in dry-run mode, **When** executed, **Then** the system reports what would happen with the specified model

---

### User Story 5 - Custom Adapter Integration (Priority: P3)

An organization wants to integrate their own embedding service or use a hosted model provider through a custom adapter.

**Why this priority**: Enables extensibility for enterprise users or those with specific model requirements, but not essential for core functionality.

**Independent Test**: Can be tested by configuring a custom adapter and verifying that embeddings are generated through the custom service.

**Acceptance Scenarios**:

1. **Given** a custom adapter is configured, **When** the embedding process runs, **Then** the custom service is called to generate embeddings
2. **Given** a hosted model adapter with authentication, **When** valid credentials are provided, **Then** embeddings are successfully generated through the remote service
3. **Given** a custom adapter fails during processing, **When** fallback is configured, **Then** the system falls back to an alternative adapter

---

### Edge Cases

- What happens when the chunk hash algorithm changes between versions?
- How does the system handle corrupted vector storage?
- What happens when switching between models with different embedding dimensions?
- How does the system handle network failures for hosted model adapters?
- What happens when storage runs out of space during embedding?
- How does the system handle concurrent embedding processes?
- What happens when an adapter returns invalid vector dimensions?
- How does the system handle very large files that produce many chunks?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support pluggable embedding adapters for different model providers
- **FR-002**: System MUST track chunk hashes to determine when re-embedding is needed
- **FR-003**: System MUST store embedding vectors with associated model identifier and version tags
- **FR-004**: System MUST only re-embed chunks when their hash has changed
- **FR-005**: CLI MUST provide `--embed model=<name>` parameter to override the default model
- **FR-006**: CLI MUST provide dry-run mode that reports what would be embedded without performing operations
- **FR-007**: System MUST support both local model adapters and hosted service adapters
- **FR-008**: System MUST store vectors in a queryable format supporting similarity search
- **FR-009**: System MUST maintain mapping between code chunks and their embeddings
- **FR-010**: System MUST handle incremental updates efficiently without full re-indexing
- **FR-011**: System MUST provide clear error messages when embedding operations fail
- **FR-012**: System MUST support concurrent read access to stored embeddings
- **FR-013**: System MUST validate vector dimensions match the model's expected output
- **FR-014**: System MUST clean up orphaned embeddings when source chunks are deleted
- **FR-015**: System MUST report progress during embedding operations
- **FR-016**: Adapters MUST follow a standard interface for integration
- **FR-017**: System MUST persist embedding metadata including generation timestamp
- **FR-018**: System MUST support batch processing for efficiency

### Key Entities

- **Embedding Adapter**: Plugin interface that handles communication with specific embedding models or services
- **Code Chunk**: A semantic unit of code with a unique hash, typically a function, class, or logical block
- **Embedding Vector**: Numerical representation of a code chunk with associated metadata (model, version, dimensions)
- **Vector Storage**: Persistent storage layer containing embeddings with support for similarity queries
- **Model Configuration**: Settings defining which adapter to use and its parameters
- **Chunk Hash**: Deterministic identifier computed from chunk content to detect changes

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Incremental embedding updates complete 10x faster than full re-indexing for codebases with <5% changes
- **SC-002**: Embedding generation processes at least 100 chunks per second for local models
- **SC-003**: System correctly identifies 100% of changed chunks based on hash comparison
- **SC-004**: Dry-run mode completes in under 5 seconds for codebases up to 10,000 files
- **SC-005**: Vector similarity queries return results in under 100ms for databases up to 1 million embeddings
- **SC-006**: System maintains zero data loss during concurrent embedding operations
- **SC-007**: 95% of users successfully configure custom adapters without support
- **SC-008**: Storage overhead for metadata remains under 10% of vector data size
- **SC-009**: Model switching requires less than 1 minute of reconfiguration time
- **SC-010**: System handles codebases with 100,000+ chunks without performance degradation

## Assumptions

- Code chunking strategy is already defined and produces consistent chunks
- Hash algorithm for chunks is deterministic and stable
- Storage layer supports efficient similarity search operations
- Embedding models produce fixed-dimension vectors for a given configuration
- Network connectivity is available for hosted model adapters
- Local models can be loaded within available system memory
- Users understand the trade-offs between different embedding models
- Vector dimensions are consistent within a single model version
- Storage format supports versioning for future migrations