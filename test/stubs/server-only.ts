/**
 * Stub for the `server-only` package under Vitest.
 *
 * That package ships a module that throws when resolved through the client
 * condition, which is exactly what a jsdom test environment picks. The guard
 * it provides is a build-time one for the Next bundler — it has nothing to
 * enforce in a unit test, so aliasing it away is safe rather than a workaround
 * for a real boundary violation.
 */
export {}
