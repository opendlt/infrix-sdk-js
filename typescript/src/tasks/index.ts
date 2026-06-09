/**
 * Task Template Marketplace — SDK entry (nextux-04).
 *
 * Re-exports the catalog types, the client, and the run-planning helpers. Bundle
 * the shipped templates.fixture.json (the Go-generated catalog) or fetch it,
 * then `createTasksClient(fixture)` to query the same registry the CLI uses.
 */

export * from './templates';
export * from './client';
export * from './run';
