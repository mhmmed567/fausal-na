/**
 * Hostinger Web/Cloud Node.js entry (must be .mjs/.js — not .ts).
 * The production build compiles the Fastify app into dist-server first.
 */
await import("./server.js");
