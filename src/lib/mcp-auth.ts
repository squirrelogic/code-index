/**
 * Authentication middleware for MCP server
 *
 * Provides optional token-based authentication via CODE_INDEX_AUTH_TOKEN environment variable.
 * When the environment variable is not set, authentication is disabled (default behavior).
 * When set, all tool requests must include a matching token in request metadata.
 */

export interface AuthRequest {
  params?: {
    _meta?: {
      authToken?: string;
    };
  };
}

/**
 * Authentication error class for MCP protocol
 */
export class AuthenticationError extends Error {
  code: number;

  constructor(message: string, code: number = -32001) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}

/**
 * Check authentication for incoming requests
 *
 * @param request - The MCP request object
 * @throws {AuthenticationError} If authentication is enabled and token is missing or invalid
 *
 * @example
 * ```typescript
 * // Authentication disabled (no CODE_INDEX_AUTH_TOKEN set)
 * checkAuth(request); // ✅ Pass - no checks performed
 *
 * // Authentication enabled (CODE_INDEX_AUTH_TOKEN=secret)
 * checkAuth({ params: { _meta: { authToken: 'secret' } } }); // ✅ Pass
 * checkAuth({ params: { _meta: { authToken: 'wrong' } } }); // ❌ Throw
 * checkAuth({ params: {} }); // ❌ Throw
 * ```
 */
export function checkAuth(request: AuthRequest): void {
  const requiredToken = process.env.CODE_INDEX_AUTH_TOKEN;

  // Authentication disabled - allow all requests
  if (!requiredToken) {
    return;
  }

  // Authentication enabled - validate token
  const clientToken = request.params?._meta?.authToken;

  if (!clientToken) {
    throw new AuthenticationError(
      "Authentication required: Missing token in request metadata",
      -32001
    );
  }

  if (clientToken !== requiredToken) {
    throw new AuthenticationError(
      "Authentication failed: Invalid token",
      -32001
    );
  }
}

/**
 * Check if authentication is currently enabled
 *
 * @returns true if CODE_INDEX_AUTH_TOKEN is set, false otherwise
 */
export function isAuthEnabled(): boolean {
  return !!process.env.CODE_INDEX_AUTH_TOKEN;
}
