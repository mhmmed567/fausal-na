import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createCrmMcpServer } from "./mcp.ts";
import { backendModeLabel, hasServiceRole, ensureCrmBackend } from "./crm.ts";
import { handleOAuthHttp, isOAuthPath, resolveMcpActor, unauthorizedChallenge } from "./oauth.ts";

let backend: Promise<string | null> | null = null;

function ensureBackend() {
  backend ??= ensureCrmBackend().finally(() => {
    backend = null;
  });
  return backend;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Session-Id, Accept",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function bearer(header: string | null) {
  if (!header) return "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export async function handleCrmHttp(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (isOAuthPath(url.pathname)) {
    await ensureBackend();
    return handleOAuthHttp(request);
  }

  const isHealth = url.pathname.endsWith("/health");
  await ensureBackend();

  if (isHealth) {
    return json({
      ok: true,
      mcp: `${publicOrigin(request)}/mcp`,
      auth: `${publicOrigin(request)}/authorize`,
      ready: hasServiceRole(),
      backend: backendModeLabel(),
    });
  }

  if (!url.pathname.endsWith("/mcp")) {
    return json({ error: "Not found" }, 404);
  }

  if (!hasServiceRole()) {
    return json({ error: "MCP server is not connected to the CRM backend" }, 503);
  }

  const origin = publicOrigin(request);
  const token = bearer(request.headers.get("authorization"));
  if (!token) {
    return unauthorizedChallenge(origin, "Authorization required. Use OAuth or send Bearer MCP token.");
  }

  const actor = await resolveMcpActor(token, `${origin}/mcp`);
  if (!actor) {
    return unauthorizedChallenge(origin, "Invalid or disabled MCP client token.");
  }

  const server = createCrmMcpServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
