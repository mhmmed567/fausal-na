import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { handleCrmHttp } from "./http.ts";
import { backendModeLabel, hasServiceRole, initCrmClient } from "./crm.ts";

const port = Number(process.env.PORT || process.env.MCP_PORT || 4010);
const publicUrl = process.env.MCP_PUBLIC_URL || `http://localhost:${port}/mcp`;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(rootDir, "dist");
const serveClient = existsSync(path.join(clientDir, "index.html"));

const app = Fastify({ logger: true, trustProxy: true });

app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  done(null, body);
});

app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
  done(null, body);
});

function toWebRequest(req: { method: string; url: string; headers: Record<string, unknown>; body?: unknown }) {
  const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || "http";
  const host = (req.headers.host as string | undefined) || `localhost:${port}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  const body = req.method === "GET" || req.method === "DELETE" || req.method === "OPTIONS"
    ? undefined
    : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body ?? {});
  return new Request(`${protocol}://${host}${req.url}`, { method: req.method, headers, body });
}

const oauthPaths = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
  "/authorize",
  "/token",
  "/register",
  "/revoke",
];

async function proxy(req: { method: string; url: string; headers: Record<string, unknown>; body?: unknown }, reply: {
  code: (n: number) => unknown;
  header: (k: string, v: string) => unknown;
  send: (b: string) => unknown;
}) {
  const response = await handleCrmHttp(toWebRequest(req));
  reply.code(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  return reply.send(await response.text());
}

for (const url of ["/health", "/mcp", ...oauthPaths]) {
  app.route({
    method: ["GET", "POST", "DELETE", "OPTIONS"],
    url,
    handler: async (req, reply) => proxy(req, reply),
  });
}

if (serveClient) {
  await app.register(fastifyStatic, {
    root: clientDir,
    wildcard: false,
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" || req.method === "HEAD") {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found" });
  });
}

try {
  await initCrmClient();
} catch (err) {
  console.warn("MCP backend init deferred:", err instanceof Error ? err.message : err);
}

await app.listen({ port, host: "0.0.0.0" });
console.log(`Nahdha CRM listening on port ${port} (${backendModeLabel() ?? "offline"})`);
console.log(`MCP: ${publicUrl}`);
console.log(`Web: ${serveClient ? `serving ${clientDir}` : "API only (run vite build for SPA)"}`);
if (!hasServiceRole()) {
  console.warn("Set SUPABASE_SERVICE_ROLE_KEY or MCP_SUPABASE_EMAIL/PASSWORD for MCP.");
}
