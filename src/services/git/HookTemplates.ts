/**
 * Git Hook Script Templates
 *
 * Pre-defined hook scripts for code-index automatic indexing.
 * All hooks are non-blocking and execute with a timeout.
 */

import { GitHookType } from '../../models/GitHookConfiguration.js';

const HOOK_MARKER = '# code-index hook v1.0.0';
const HOOK_TIMEOUT = 5; // seconds

/**
 * Generate hook script for a specific Git hook type
 */
export function generateHookScript(hookType: GitHookType): string {
  const shebang = '#!/bin/sh';
  const nonBlockingWrapper = `(
  timeout ${HOOK_TIMEOUT}s code-index refresh --git-range "$PREV_HEAD..$NEW_HEAD" \\
    >> .codeindex/logs/git-hook.log 2>&1
) &
exit 0`;

  switch (hookType) {
    case GitHookType.POST_MERGE:
      return `${shebang}
${HOOK_MARKER}

# post-merge hook for code-index
# Arguments: none (merge happens on HEAD)
PREV_HEAD=$1
NEW_HEAD=$(git rev-parse HEAD)

${nonBlockingWrapper}
`;

    case GitHookType.POST_CHECKOUT:
      return `${shebang}
${HOOK_MARKER}

# post-checkout hook for code-index
# Arguments: prev-ref new-ref is-branch-checkout
PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_CHECKOUT=$3

# Only reindex on branch checkouts (not file checkouts)
if [ "$BRANCH_CHECKOUT" = "1" ]; then
  ${nonBlockingWrapper}
fi
`;

    case GitHookType.POST_REWRITE:
      return `${shebang}
${HOOK_MARKER}

# post-rewrite hook for code-index
# Arguments: amend|rebase
OPERATION=$1

# Read old/new commit pairs from stdin
while read OLD_SHA NEW_SHA; do
  PREV_HEAD=$OLD_SHA
  NEW_HEAD=$NEW_SHA
  ${nonBlockingWrapper}
done
`;

    default:
      throw new Error(`Unknown hook type: ${hookType}`);
  }
}

/**
 * Get the hook marker string used to identify our hooks
 */
export function getHookMarker(): string {
  return HOOK_MARKER;
}

/**
 * Check if a hook script contains our marker
 */
export function hasHookMarker(content: string): boolean {
  return content.includes(HOOK_MARKER);
}

/**
 * Extract our hook code from a script (for uninstallation)
 */
export function extractHookCode(content: string): { before: string; hook: string; after: string } {
  if (!hasHookMarker(content)) {
    return { before: content, hook: '', after: '' };
  }

  const markerIndex = content.indexOf(HOOK_MARKER);
  const before = content.substring(0, markerIndex).trim();

  // Find the end of our hook code (next shebang or end of file)
  const afterMarker = content.substring(markerIndex);
  const nextShebangIndex = afterMarker.indexOf('\n#!/', 1);

  if (nextShebangIndex !== -1) {
    const hook = afterMarker.substring(0, nextShebangIndex).trim();
    const after = afterMarker.substring(nextShebangIndex).trim();
    return { before, hook, after };
  }

  // Our hook code extends to end of file
  return { before, hook: afterMarker.trim(), after: '' };
}

/**
 * Remove our hook code from a script
 */
export function removeHookCode(content: string): string {
  const { before, after } = extractHookCode(content);

  if (!before && !after) {
    return ''; // Our hook was the only content
  }

  const parts = [before, after].filter((p) => p.length > 0);
  return parts.join('\n\n') + '\n';
}
