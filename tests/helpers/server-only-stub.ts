/**
 * Stand-in for the `server-only` package inside Vitest.
 *
 * The real module throws on import so that a server module can never be pulled
 * into a client bundle. That protection is a Next.js build concern; in a plain
 * Node test process it would simply make every server module untestable.
 */
export {};
