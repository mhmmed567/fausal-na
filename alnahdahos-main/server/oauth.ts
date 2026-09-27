import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { adminClient, authenticateToken, ensureCrmBackend, type McpActor } from "./crm.ts";
import { createCrmSupabase } from "./supabase.ts";

type OAuthClient = {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
};

type AuthCodePayload = {
  typ: "code";
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string;
  scopes: string[];
  actor: McpActor;
  exp: number;
};

type AccessTokenPayload = {
  typ: "access" | "refresh";
  clientId: string;
  scopes: string[];
  actor: McpActor;
  resource?: string;
  exp: number;
};

async function stateGet(key: string) {
  const { data, error } = await adminClient().from("mcp_oauth_state").select("value").eq("key", key).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(error) throw error;
  return data?.value ?? null;
}
async function statePut(key: string, value: object, expiresAt: number) {
  const { error } = await adminClient().from("mcp_oauth_state").upsert({ key, value, expires_at: new Date(expiresAt).toISOString() });
  if(error) throw error;
}
function tokenKey(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function liveActor(id: string): Promise<McpActor | null> {
  await ensureCrmBackend();
  const { data, error } = await adminClient().from("mcp_clients").select("id,name,permissions").eq("id",id).eq("status","active").maybeSingle();
  if(error) throw error;
  return data && data.permissions?.length ? data : null;
}

const SCOPES = ["mcp:tools"];

let persistentSigningKey: string | null = null;
async function ensureSigningKey() {
  if (process.env.OAUTH_SIGNING_SECRET || persistentSigningKey) return;
  let value = await stateGet("signing-secret");
  if (!value) {
    const { error } = await adminClient().from("mcp_oauth_state").upsert({key:"signing-secret",value:{secret:randomBytes(64).toString("base64url")},expires_at:"2126-01-01T00:00:00Z"},{onConflict:"key",ignoreDuplicates:true});
    if(error) throw error;
    value = await stateGet("signing-secret");
  }
  if (!value?.secret) throw new Error("missing_oauth_signing_secret");
  persistentSigningKey = value.secret;
}
function signingSecret() {
  const secret = process.env.OAUTH_SIGNING_SECRET || persistentSigningKey;
  if (!secret) throw new Error("missing_oauth_signing_secret");
  return secret;
}

function b64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(prefix: string, payload: object) {
  const body = b64urlJson(payload);
  const sig = createHmac("sha256", signingSecret()).update(`${prefix}.${body}`).digest("base64url");
  return `${prefix}.${body}.${sig}`;
}

function verifySigned<T extends { exp: number }>(token: string, expectedPrefix: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [prefix, body, sig] = parts;
  if (prefix !== expectedPrefix || !body || !sig) return null;
  const expected = createHmac("sha256", signingSecret()).update(`${prefix}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function mintAuthCode(payload: Omit<AuthCodePayload, "typ" | "exp"> & { expiresInMs?: number }) {
  const { expiresInMs = 10 * 60 * 1000, ...rest } = payload;
  return signPayload("ndh_code", {
    typ: "code",
    ...rest,
    exp: Date.now() + expiresInMs,
  } satisfies AuthCodePayload);
}

function mintAccessToken(payload: Omit<AccessTokenPayload, "typ" | "exp">, expiresInSec: number) {
  return signPayload("ndh_oauth", {
    typ: "access",
    ...payload,
    exp: Date.now() + expiresInSec * 1000,
  } satisfies AccessTokenPayload);
}

function mintRefreshToken(payload: Omit<AccessTokenPayload, "typ" | "exp">, expiresInSec: number) {
  return signPayload("ndh_refresh", {
    typ: "refresh",
    ...payload,
    exp: Date.now() + expiresInSec * 1000,
  } satisfies AccessTokenPayload);
}

function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

function mcpResource(origin: string) {
  return `${origin}/mcp`;
}

function resourceMetadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource`;
}

export function unauthorizedChallenge(origin: string, message: string) {
  const metadata = resourceMetadataUrl(origin);
  return Response.json(
    { error: "unauthorized", error_description: message },
    {
      status: 401,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Session-Id, Accept",
        "WWW-Authenticate": `Bearer realm="nahdha-crm", resource_metadata="${metadata}"`,
      },
    },
  );
}

function pkceS256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function parseBody(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
  }
  if (type.includes("application/json")) {
    try {
      return (await request.json()) as Record<string, string>;
    } catch {
      return {};
    }
  }
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
  }
}

async function actorFromCrmLogin(email: string, password: string): Promise<McpActor | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !email || !password) throw new Error("missing_env");

  const userClient = createCrmSupabase(url, anon, { persistSession: false, autoRefreshToken: false });
  const { data: signed, error } = await userClient.auth.signInWithPassword({ email, password });
  if (error || !signed.user) throw new Error(`auth_${error?.message || "failed"}`);

  const { data: profile, error: profileError } = await userClient.from("profiles").select("id, full_name, role, is_active").eq("id", signed.user.id).maybeSingle();
  if (profileError) throw new Error(`profile_${profileError.message}`);
  if (!profile || !profile.is_active || profile.role !== "admin") {
    await userClient.auth.signOut();
    throw new Error(`role_${profile?.role || "none"}_inactive_${!profile?.is_active}`);
  }

  const { data: mcpClient, error: mcpError } = await userClient
    .from("mcp_clients")
    .select("id, name, permissions, status")
    .eq("status", "active")
    .eq("name", "Mazen")
    .not("permissions", "eq", "{}")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await userClient.auth.signOut();
  if (mcpError) throw new Error(`mcp_${mcpError.message}`);
  if (!mcpClient) throw new Error("no_active_mcp_client");

  return {
    id: mcpClient.id,
    name: `${mcpClient.name} (${profile.full_name || email})`,
    permissions: mcpClient.permissions ?? [],
  };
}

function loginPageHtml(origin: string, params: URLSearchParams, error?: string) {
  const hidden = ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method", "scope", "resource"]
    .map((key) => {
      const value = params.get(key);
      if (!value) return "";
      return `<input type="hidden" name="${key}" value="${escapeHtml(value)}" />`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>مصادقة صيدلية النهضة — MCP</title>
  <style>
    :root { color-scheme: light; font-family: "IBM Plex Sans Arabic", system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f6f4; color: #16302a; }
    form { width: min(440px, 92vw); background: #fff; border: 1px solid #d7e2dc; border-radius: 16px; padding: 28px; box-shadow: 0 10px 30px rgb(22 48 42 / 6%); }
    h1 { margin: 0 0 8px; font-size: 1.35rem; }
    p { margin: 0 0 18px; color: #4d655d; line-height: 1.5; font-size: .95rem; }
    label { display: block; font-size: .9rem; margin: 12px 0 6px; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #c9d7d0; border-radius: 10px; padding: 12px 14px; font: inherit; }
    button { margin-top: 18px; width: 100%; border: 0; border-radius: 10px; padding: 12px 14px; background: #1f6f5b; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .err { background: #fde8e8; color: #8a1f1f; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; font-size: .9rem; }
    .hint { margin-top: 14px; font-size: .82rem; color: #6a7f76; }
    .or { display:flex; align-items:center; gap:10px; margin: 18px 0 6px; color:#7a8f86; font-size:.8rem; }
    .or:before, .or:after { content:""; flex:1; height:1px; background:#d7e2dc; }
    code { background: #eef4f1; padding: 1px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <form method="post" action="${escapeHtml(origin)}/authorize">
    <h1>صيدلية النهضة</h1>
    <p>اربط Hermes / Mazen عبر تسجيل دخول المسؤول، أو رمز عميل MCP.</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
    ${hidden}
    <label for="email">بريد المسؤول</label>
    <input id="email" name="email" type="email" autocomplete="username" placeholder="admin@nahdha.local" />
    <label for="password">كلمة المرور</label>
    <input id="password" name="password" type="password" autocomplete="current-password" />
    <div class="or">أو</div>
    <label for="mcp_token">رمز عميل MCP</label>
    <input id="mcp_token" name="mcp_token" type="password" autocomplete="off" placeholder="ndh_live_..." />
    <button type="submit">تفويض والربط</button>
    <p class="hint">المسؤول فقط. الرمز من <code>الإعدادات → MCP</code>.</p>
  </form>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

export function isOAuthPath(pathname: string) {
  return (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp" ||
    pathname === "/.well-known/oauth-authorization-server" ||
    pathname === "/.well-known/openid-configuration" ||
    pathname === "/authorize" ||
    pathname === "/token" ||
    pathname === "/register" ||
    pathname === "/revoke"
  );
}

export async function handleOAuthHttp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  await ensureSigningKey();
  const origin = publicOrigin(request);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Session-Id, Accept",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  if (
    path === "/.well-known/oauth-protected-resource" ||
    path === "/.well-known/oauth-protected-resource/mcp"
  ) {
    return json({
      resource: mcpResource(origin),
      authorization_servers: [origin],
      scopes_supported: SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/health`,
    });
  }

  if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") {
    return json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      revocation_endpoint: `${origin}/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      scopes_supported: SCOPES,
    });
  }

  if (path === "/register" && request.method === "POST") {
    const body = await parseBody(request);
    const rawRedirects = (body as { redirect_uris?: string[] | string }).redirect_uris;
    const redirectUris = Array.isArray(rawRedirects)
      ? rawRedirects
      : typeof rawRedirects === "string"
        ? [rawRedirects]
        : [];
    if (!redirectUris.length || redirectUris.some(uri => { try { const u = new URL(uri); return u.hash || u.username || u.password || !(u.protocol === "https:" || (u.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(u.hostname))); } catch { return true; } })) {
      return json({ error: "invalid_client_metadata", error_description: "redirect_uris required" }, 400);
    }
    if (body.token_endpoint_auth_method && !["none","client_secret_post"].includes(body.token_endpoint_auth_method)) return json({error:"invalid_client_metadata"},400);
    const client: OAuthClient = {
      client_id: randomUUID(),
      client_secret: randomBytes(24).toString("hex"),
      redirect_uris: redirectUris,
      client_name: body.client_name || "MCP Client",
      token_endpoint_auth_method: body.token_endpoint_auth_method || "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
    await statePut(`client:${client.client_id}`, client, Date.now()+90*24*3600*1000);
    return json({
      ...client,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
    }, 201);
  }

  if (path === "/authorize") {
    if (request.method === "GET") {
      if (url.searchParams.get("response_type") !== "code") {
        return html(loginPageHtml(origin, url.searchParams, "response_type يجب أن يكون code"), 400);
      }
      if (!url.searchParams.get("client_id") || !url.searchParams.get("redirect_uri") || !url.searchParams.get("code_challenge")) {
        return html(loginPageHtml(origin, url.searchParams, "طلب التفويض غير مكتمل"), 400);
      }
      return html(loginPageHtml(origin, url.searchParams));
    }

    if (request.method === "POST") {
      const body = await parseBody(request);
      const params = new URLSearchParams();
      for (const key of ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method", "scope", "resource"]) {
        if (body[key]) params.set(key, body[key]);
      }

      const mcpToken = (body.mcp_token || "").trim();
      let actor: McpActor | null = null;
      let loginError = "فشل تسجيل الدخول. استخدم حساب مسؤول أو رمز MCP صالح.";
      if (mcpToken) {
        try {
          actor = await authenticateToken(mcpToken);
          if (!actor) loginError = "رمز MCP غير صالح أو معطّل.";
        } catch (err) {
          loginError =
            err instanceof Error && err.message.includes("MCP backend")
              ? "خادم MCP غير مهيأ على الاستضافة (مفاتيح Supabase)."
              : "تعذّر التحقق من رمز MCP.";
        }
      }
      if (!actor && body.email && body.password) {
        try {
          actor = await actorFromCrmLogin(body.email.trim(), body.password);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (msg === "missing_env") loginError = "إعدادات Supabase ناقصة على الخادم.";
          else if (msg.startsWith("auth_")) loginError = "البريد أو كلمة المرور غير صحيحة.";
          else if (msg.startsWith("role_")) loginError = "الحساب ليس مسؤولاً نشطاً.";
          else if (msg === "no_active_mcp_client") loginError = "لا يوجد عميل MCP نشط. أنشئ واحداً من الإعدادات.";
          else loginError = "فشل تسجيل الدخول بحساب المسؤول.";
        }
      }
      if (!actor) {
        return html(loginPageHtml(origin, params, loginError), 401);
      }

      const clientId = body.client_id;
      const redirectUri = body.redirect_uri;
      const codeChallenge = body.code_challenge;
      if (!clientId || !redirectUri || !codeChallenge) {
        return html(loginPageHtml(origin, params, "معاملات OAuth ناقصة"), 400);
      }

      const client = await stateGet(`client:${clientId}`) as OAuthClient | null;
      if (!client || !client.redirect_uris.includes(redirectUri)) return json({error:"invalid_client",error_description:"Register the exact redirect URI first"},400);
      if (body.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) return json({error:"invalid_request",error_description:"S256 PKCE is required"},400);
      if (body.resource && body.resource !== mcpResource(origin)) return json({error:"invalid_target"},400);
      if (body.scope && body.scope.split(" ").some(scope => !SCOPES.includes(scope))) return json({error:"invalid_scope"},400);

      let code: string;
      try {
        code = mintAuthCode({
          clientId,
          redirectUri,
          codeChallenge,
          codeChallengeMethod: body.code_challenge_method || "S256",
          resource: body.resource || mcpResource(origin),
          scopes: SCOPES,
          actor,
        });
      } catch {
        return html(loginPageHtml(origin, params, "تعذّر إنشاء رمز التفويض (سر التوقيع ناقص)."), 500);
      }

      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (body.state) target.searchParams.set("state", body.state);
      return Response.redirect(target.toString(), 302);
    }
  }

  if (path === "/token" && request.method === "POST") {
    const body = await parseBody(request);
    const registered = await stateGet(`client:${body.client_id}`) as OAuthClient | null;
    if (!registered || (registered.token_endpoint_auth_method === "client_secret_post" && registered.client_secret !== body.client_secret)) return json({error:"invalid_client"},401);
    if (body.grant_type === "refresh_token") {
      const existing = verifySigned<AccessTokenPayload>(body.refresh_token || "", "ndh_refresh");
      if (!existing || existing.typ !== "refresh" || existing.clientId !== body.client_id || (body.resource && body.resource !== existing.resource) || await stateGet(`revoked:${tokenKey(body.refresh_token)}`)) {
        return json({ error: "invalid_grant" }, 400);
      }
      const currentActor = await liveActor(existing.actor.id);
      if (!currentActor) return json({error:"invalid_grant"},400);
      const expiresIn = 3600;
      let accessToken: string;
      try {
        accessToken = mintAccessToken(
          {
            clientId: existing.clientId,
            scopes: existing.scopes,
            actor: currentActor,
            resource: existing.resource,
          },
          expiresIn,
        );
      } catch {
        return json({ error: "server_error", error_description: "signing secret missing" }, 500);
      }
      return json({
        access_token: accessToken,
        token_type: "bearer",
        expires_in: expiresIn,
        refresh_token: body.refresh_token,
        scope: existing.scopes.join(" "),
      });
    }

    if (body.grant_type !== "authorization_code") {
      return json({ error: "unsupported_grant_type" }, 400);
    }
    const codeData = verifySigned<AuthCodePayload>(body.code || "", "ndh_code");
    if (!codeData || codeData.typ !== "code") {
      return json({ error: "invalid_grant", error_description: "Invalid or expired code" }, 400);
    }
    if (codeData.clientId !== body.client_id) {
      return json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
    }
    if (codeData.redirectUri !== body.redirect_uri) {
      return json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
    }
    const verifier = body.code_verifier || "";
    if (!verifier || pkceS256(verifier) !== codeData.codeChallenge) {
      return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }

    if (body.resource && body.resource !== codeData.resource) return json({error:"invalid_target"},400);
    const currentActor = await liveActor(codeData.actor.id);
    if (!currentActor) return json({error:"invalid_grant"},400);
    const { error: usedError } = await adminClient().from("mcp_oauth_state").insert({key:`used:${tokenKey(body.code)}`,value:{},expires_at:new Date(codeData.exp).toISOString()});
    if (usedError) return json({error:"invalid_grant",error_description:"Authorization code already used"},400);
    const expiresIn = 3600;
    let accessToken: string;
    let refreshToken: string;
    try {
      accessToken = mintAccessToken(
        {
          clientId: codeData.clientId,
          scopes: codeData.scopes,
          actor: currentActor,
          resource: codeData.resource,
        },
        expiresIn,
      );
      refreshToken = mintRefreshToken(
        {
          clientId: codeData.clientId,
          scopes: codeData.scopes,
          actor: currentActor,
          resource: codeData.resource,
        },
        30 * 24 * 3600,
      );
    } catch {
      return json({ error: "server_error", error_description: "signing secret missing" }, 500);
    }

    return json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: codeData.scopes.join(" "),
    });
  }

  if (path === "/revoke" && request.method === "POST") {
    const body = await parseBody(request);
    const signed = verifySigned<AccessTokenPayload>(body.token || "", "ndh_oauth") || verifySigned<AccessTokenPayload>(body.token || "", "ndh_refresh");
    if (signed) await statePut(`revoked:${tokenKey(body.token)}`, {}, signed.exp);
    return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  return json({ error: "not_found" }, 404);
}

export async function resolveMcpActor(token: string, expectedResource?: string): Promise<McpActor | null> {
  if (token.startsWith("ndh_oauth.")) {
    await ensureSigningKey();
    const oauth = verifySigned<AccessTokenPayload>(token, "ndh_oauth");
    if (oauth?.typ === "access" && oauth.scopes.includes("mcp:tools") && (!expectedResource || oauth.resource === expectedResource) && !await stateGet(`revoked:${tokenKey(token)}`)) return liveActor(oauth.actor.id);
    return null;
  }
  return authenticateToken(token);
}
