# Feature Specification: Hardware-Aware Embedding Selection

**Feature Branch**: `007-hardware-aware-embedding`
**Created**: 2025-01-12
**Status**: Draft
**Input**: User description: "Hardware-aware embedding selection with auto-detect (CPU/MPS/CUDA), user profiles (light/balanced/performance/custom), ONNX/PyTorch backends, quantization (int8/int4), caching, CLI controls, and graceful fallbacks. Detect hardware at init/doctor; persist config in .codeindex/config.json (profile, model, backend, quantization, batchSize, cacheDir). Provide CLI: code-index config set embedding.profile <...>, config set embedding.model <hf-id|path>, embed --rebuild, doctor (prints backend/model/dims/quantization/batch/cache, and any fallback). Fallback order: reduce batch → switch GPU→CPU/MPS → swap to small/int8 model; always continue and log. Acceptance: CPU-only picks light+ONNX int8 and embeds; Apple Silicon picks MPS balanced and embeds; RTX 30+ picks CUDA FP16 performance and embeds or auto-dials batch; forced provider failure triggers logged fallback and successful run."

## Clarifications

### Session 2025-01-13

- Q: What embedding dimensions should the system support, and how should dimension mismatches be handled when switching models? → A: Allow any dimension, but automatically invalidate the entire cache when dimension changes (with warning)
- Q: Should the fallback chain try all steps in sequence or stop at the first successful configuration? → A: Stop at the first successful fallback step and continue with that configuration
- Q: Which specific embedding models should be used for each profile (light/balanced/performance)? → A: Use sentence-transformers models: light=all-MiniLM-L6-v2 (384d), balanced=all-mpnet-base-v2 (768d), performance=instructor-large (768d)
- Q: How should embeddings be stored in the cache for optimal performance and concurrent access? → A: Store in SQLite database with embeddings as binary blobs, indexed by content hash and dimensions
- Q: What batch size range should the system use for auto-adjustment? → A: Start 32, max 256

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Setup with Hardware Auto-Detection (Priority: P1)

A developer installs the code indexing tool and runs it for the first time. The system automatically detects their hardware capabilities and selects the optimal embedding configuration without requiring manual setup.

**Why this priority**: This is the critical first experience that enables all other functionality. Users expect the tool to "just work" on their hardware without complex configuration.

**Independent Test**: Can be fully tested by running the tool on different hardware configurations (CPU-only, Apple Silicon, NVIDIA GPU) and verifying appropriate profile selection and successful embedding generation.

**Acceptance Scenarios**:

1. **Given** a CPU-only machine without GPU acceleration, **When** the user runs the tool for the first time, **Then** the system automatically selects the "light" profile with ONNX int8 quantization and successfully generates embeddings
2. **Given** an Apple Silicon Mac with MPS support, **When** the user runs the tool for the first time, **Then** the system automatically selects the "balanced" profile with MPS acceleration and successfully generates embeddings
3. **Given** a machine with NVIDIA RTX 30-series or newer GPU, **When** the user runs the tool for the first time, **Then** the system automatically selects the "performance" profile with CUDA FP16 support and successfully generates embeddings

---

### User Story 2 - Configuration Management via CLI (Priority: P2)

A power user wants to customize the embedding configuration to optimize for their specific needs, such as switching profiles, changing models, or adjusting quantization settings.

**Why this priority**: While auto-detection handles most cases, power users need control to optimize for specific use cases like maximizing speed vs quality trade-offs.

**Independent Test**: Can be tested by running configuration commands and verifying changes persist in the config file and are applied on the next embedding run.

**Acceptance Scenarios**:

1. **Given** the tool is configured with default settings, **When** the user runs `code-index config set embedding.profile performance`, **Then** the configuration updates to use the performance profile and persists to .codeindex/config.json
2. **Given** the tool is using a default model, **When** the user runs `code-index config set embedding.model <huggingface-id>` with a valid model identifier, **Then** the system downloads and uses the specified model for future embeddings
3. **Given** existing embeddings in the cache, **When** the user runs `code-index embed --rebuild`, **Then** all embeddings are regenerated using the current configuration

---

### User Story 3 - System Diagnostics and Health Check (Priority: P2)

A developer needs to understand what embedding configuration is active, verify hardware detection is correct, and troubleshoot any performance issues.

**Why this priority**: Users need visibility into the system's decisions to diagnose issues and understand performance characteristics.

**Independent Test**: Can be tested by running the doctor command on various hardware configurations and verifying accurate reporting of all system parameters.

**Acceptance Scenarios**:

1. **Given** the tool is configured and running, **When** the user runs `code-index doctor`, **Then** the system displays current backend (CPU/MPS/CUDA), model details, embedding dimensions, quantization level, batch size, cache directory, and any active fallbacks
2. **Given** a misconfigured environment, **When** the user runs `code-index doctor`, **Then** the system identifies configuration issues and suggests corrective actions

---

### User Story 4 - Graceful Fallback During Resource Constraints (Priority: P1)

When the system encounters resource limitations (out of memory, GPU unavailable, model loading failures), it automatically falls back to a configuration that can run successfully while maintaining service continuity.

**Why this priority**: Critical for reliability - users should never experience complete failure when fallback options exist.

**Independent Test**: Can be tested by simulating various failure conditions (limiting memory, disabling GPU, corrupting model files) and verifying the system continues operating with logged fallbacks.

**Acceptance Scenarios**:

1. **Given** the system is configured for CUDA with large batch size, **When** GPU memory is exhausted during embedding, **Then** the system automatically reduces batch size and continues processing with a logged warning
2. **Given** the system is configured for GPU acceleration, **When** the GPU becomes unavailable, **Then** the system automatically switches to CPU or MPS processing and continues with a logged fallback notification
3. **Given** the system is using a large model, **When** memory constraints prevent loading, **Then** the system automatically switches to a smaller quantized model and continues processing

---

### User Story 5 - Custom Profile Creation (Priority: P3)

An advanced user with specific requirements wants to create a custom embedding profile that combines specific settings not covered by the preset profiles.

**Why this priority**: Advanced customization enables specialized use cases but is not required for core functionality.

**Independent Test**: Can be tested by creating custom profiles with various parameter combinations and verifying they are applied correctly.

**Acceptance Scenarios**:

1. **Given** the standard profiles don't meet requirements, **When** the user creates a custom profile with specific backend, model, and quantization settings, **Then** the system saves and applies the custom profile when selected
2. **Given** a custom profile is active, **When** the user switches between custom and preset profiles, **Then** the system correctly applies each profile's settings

---

### Edge Cases

- What happens when the configuration file is corrupted or contains invalid values?
- How does the system handle partial hardware support (e.g., old GPU with limited CUDA compatibility)?
- What happens when cache directory has insufficient disk space?
- How does the system handle concurrent access to the cache from multiple processes? → SQLite database with appropriate locking handles concurrent access
- What happens when a specified model download is interrupted?
- How does the system behave when switching between incompatible embedding models (different dimensions)? → System automatically invalidates entire cache with warning when dimensions change
- What happens when quantization is requested but not supported by the selected backend?
- How does the system handle permission issues when accessing the configuration or cache directories?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically detect hardware capabilities (CPU, MPS for Apple Silicon, CUDA for NVIDIA GPUs) at initialization
- **FR-002**: System MUST support predefined embedding profiles ("light", "balanced", "performance") with appropriate defaults for each hardware type
- **FR-003**: System MUST allow custom profile configuration with user-specified parameters
- **FR-004**: System MUST support multiple embedding backends (ONNX Runtime, PyTorch)
- **FR-005**: System MUST support model quantization options (int8, int4, fp16, fp32)
- **FR-006**: System MUST persist all configuration in .codeindex/config.json file
- **FR-007**: CLI MUST provide `config set` commands for embedding.profile, embedding.model, embedding.backend, embedding.quantization, embedding.batchSize, and embedding.cacheDir
- **FR-008**: CLI MUST provide `embed --rebuild` command to regenerate all embeddings with current configuration
- **FR-009**: CLI MUST provide `doctor` command displaying current configuration and system health
- **FR-010**: System MUST implement automatic fallback chain (reduce batch size → switch from GPU to CPU/MPS → switch to smaller/quantized model), stopping at the first successful configuration
- **FR-011**: System MUST log all fallback actions with clear explanations of why fallback occurred
- **FR-012**: System MUST continue operation even when optimal configuration cannot be achieved
- **FR-013**: System MUST cache generated embeddings in SQLite database within specified cache directory, storing embeddings as binary blobs indexed by content hash and dimensions
- **FR-014**: System MUST validate model compatibility before attempting to load
- **FR-015**: System MUST provide clear error messages for configuration issues
- **FR-016**: Default profiles MUST map to appropriate configurations: light (all-MiniLM-L6-v2/384d, int8), balanced (all-mpnet-base-v2/768d, int8/fp16), performance (instructor-large/768d, fp16/fp32)
- **FR-017**: System MUST support loading models from Hugging Face model hub or local file paths
- **FR-018**: Configuration changes MUST take effect on next embedding operation without requiring restart
- **FR-019**: System MUST track embedding dimensions for each model and automatically invalidate the cache when switching to a model with different dimensions
- **FR-020**: System MUST warn users before cache invalidation due to dimension changes and log the invalidation event
- **FR-021**: System MUST support batch size auto-adjustment within the range of 32 (default start) to 256 (maximum) for GPU-accelerated processing

### Key Entities

- **Embedding Profile**: Represents a complete configuration set including model selection, backend, quantization, and processing parameters
- **Hardware Configuration**: Detected hardware capabilities including processor type, available accelerators, and memory constraints
- **Embedding Model**: The neural network model used for generating embeddings, with attributes like dimensions, size, and supported quantization
- **Fallback Chain**: Ordered sequence of configuration downgrades to maintain operation under resource constraints
- **Cache Entry**: Stored embedding vectors in SQLite as binary blobs, associated with specific content hash, configuration version, and embedding dimensions for efficient retrieval

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Hardware detection completes within 2 seconds on first run across all supported platforms
- **SC-002**: Embedding generation continues successfully in 100% of cases where any viable fallback option exists
- **SC-003**: Configuration changes via CLI commands take effect immediately without requiring application restart
- **SC-004**: 95% of users on supported hardware achieve successful embedding generation on first run without manual configuration
- **SC-005**: Doctor command provides complete diagnostic information within 1 second
- **SC-006**: Fallback transitions complete within 5 seconds of detecting resource constraints
- **SC-007**: Cache retrieval for existing embeddings completes 10x faster than regeneration
- **SC-008**: Memory usage stays within 80% of available system memory through automatic batch size adjustment
- **SC-009**: 90% of users can complete basic configuration tasks without consulting documentation
- **SC-010**: System processes 1000+ files without failure on minimum hardware (4GB RAM, CPU-only)

## Assumptions

- Users have at least 4GB of RAM available for the application
- Supported hardware includes x86/ARM CPUs, Apple Silicon with MPS, and NVIDIA GPUs with CUDA support
- Network connectivity is available for initial model downloads from Hugging Face
- Operating system provides standard file system permissions for cache and configuration storage
- Python environment supports required libraries for ONNX Runtime and/or PyTorch
- Models follow standard sentence-transformers conventions for input/output formats
- Default models (all-MiniLM-L6-v2, all-mpnet-base-v2, instructor-large) are available on Hugging Face model hub
- Cache invalidation is handled when configuration changes affect embedding dimensions
- Profile presets are optimized based on typical hardware capabilities for each category
- Batch size range (32-256) is appropriate for typical GPU memory configurations (4GB-24GB VRAM)