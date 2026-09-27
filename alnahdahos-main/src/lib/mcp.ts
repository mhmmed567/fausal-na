export function mcpEndpoint() {
  const configured = import.meta.env.VITE_MCP_ENDPOINT;
  if (typeof window === "undefined") return configured || "http://localhost:4010/mcp";

  const hosted = !["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (hosted) {
    if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured;
    return `${window.location.origin}/mcp`;
  }

  return configured || "http://localhost:4010/mcp";
}

export function mcpRunsOnThisHost() {
  if (typeof window === "undefined") return false;
  const endpoint = mcpEndpoint();
  try {
    return new URL(endpoint).origin === window.location.origin || endpoint.includes("localhost:4010");
  } catch {
    return false;
  }
}
