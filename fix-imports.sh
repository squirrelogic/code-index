#!/bin/bash

# Fix imports in watch.ts
sed -i '' "s|'../../models/WatcherConfig'|'../../models/WatcherConfig.js'|g" src/cli/commands/watch.ts
sed -i '' "s|'../../services/watcher/FileWatcher'|'../../services/watcher/FileWatcher.js'|g" src/cli/commands/watch.ts
sed -i '' "s|'../../services/watcher/BatchProcessor'|'../../services/watcher/BatchProcessor.js'|g" src/cli/commands/watch.ts
sed -i '' "s|'../../services/indexer/IncrementalIndexerAdapter'|'../../services/indexer/IncrementalIndexerAdapter.js'|g" src/cli/commands/watch.ts
sed -i '' "s|'../../services/database'|'../../services/database.js'|g" src/cli/commands/watch.ts
sed -i '' "s|'../utils/WatcherLogger'|'../utils/WatcherLogger.js'|g" src/cli/commands/watch.ts
sed -i '' "s|'../utils/output'|'../utils/output.js'|g" src/cli/commands/watch.ts
sed -i '' "s|'../../models/FileChangeEvent'|'../../models/FileChangeEvent.js'|g" src/cli/commands/watch.ts

# Fix imports in WatcherStatusReporter.ts
sed -i '' "s|'./output'|'./output.js'|g" src/cli/utils/WatcherStatusReporter.ts
sed -i '' "s|'../../models/FileChangeEvent'|'../../models/FileChangeEvent.js'|g" src/cli/utils/WatcherStatusReporter.ts
sed -i '' "s|'../../services/watcher/BatchProcessor'|'../../services/watcher/BatchProcessor.js'|g" src/cli/utils/WatcherStatusReporter.ts
sed -i '' "s|'../../services/watcher/FileWatcher'|'../../services/watcher/FileWatcher.js'|g" src/cli/utils/WatcherStatusReporter.ts

# Fix imports in DebounceBuffer.ts
sed -i '' "s|'./FileChangeEvent'|'./FileChangeEvent.js'|g" src/models/DebounceBuffer.ts

# Fix imports in IncrementalIndexerAdapter.ts
sed -i '' "s|'../database'|'../database.js'|g" src/services/indexer/IncrementalIndexerAdapter.ts

# Fix imports in BatchProcessor.ts
sed -i '' "s|'../../models/FileChangeEvent'|'../../models/FileChangeEvent.js'|g" src/services/watcher/BatchProcessor.ts
sed -i '' "s|'../indexer/IncrementalIndexer'|'../indexer/IncrementalIndexerAdapter.js'|g" src/services/watcher/BatchProcessor.ts
sed -i '' "s|'../../cli/utils/WatcherLogger'|'../../cli/utils/WatcherLogger.js'|g" src/services/watcher/BatchProcessor.ts
sed -i '' "s|'../../lib/RetryManager'|'../../lib/RetryManager.js'|g" src/services/watcher/BatchProcessor.ts

# Fix imports in DebounceManager.ts
sed -i '' "s|'../../models/FileChangeEvent'|'../../models/FileChangeEvent.js'|g" src/services/watcher/DebounceManager.ts
sed -i '' "s|'../../models/DebounceBuffer'|'../../models/DebounceBuffer.js'|g" src/services/watcher/DebounceManager.ts

# Fix imports in FileWatcher.ts
sed -i '' "s|'../../models/FileChangeEvent'|'../../models/FileChangeEvent.js'|g" src/services/watcher/FileWatcher.ts
sed -i '' "s|'../../models/WatcherConfig'|'../../models/WatcherConfig.js'|g" src/services/watcher/FileWatcher.ts
sed -i '' "s|'./DebounceManager'|'./DebounceManager.js'|g" src/services/watcher/FileWatcher.ts
sed -i '' "s|'./IgnorePatterns'|'./IgnorePatterns.js'|g" src/services/watcher/FileWatcher.ts
sed -i '' "s|'../../lib/FileSystemUtils'|'../../lib/FileSystemUtils.js'|g" src/services/watcher/FileWatcher.ts
sed -i '' "s|'../../cli/utils/WatcherLogger'|'../../cli/utils/WatcherLogger.js'|g" src/services/watcher/FileWatcher.ts

echo "Import paths fixed!"
