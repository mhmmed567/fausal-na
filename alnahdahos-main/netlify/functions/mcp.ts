import { handleCrmHttp } from "../../server/http.ts";

export default async (request: Request) => handleCrmHttp(request);

export const config = {
  path: [
    "/mcp",
    "/health",
    "/authorize",
    "/token",
    "/register",
    "/revoke",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server",
    "/.well-known/openid-configuration",
  ],
};
