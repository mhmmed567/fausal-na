# صيدلية النهضة — CRM

Traditional staff CRM for **مستشفى النهضة / صيدلية النهضة**.

This is not an AI CRM. Mazen connects from outside through the authenticated **MCP server**.

## Stack

- React + TypeScript + Vite
- HeroUI v3 + Tailwind CSS v4
- Supabase Auth, Postgres, RLS
- MCP server (Fastify + Streamable HTTP)

## Run

```bash
cp .env.example .env.local
# fill VITE_SUPABASE_* and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

- Web: http://localhost:5173
- MCP: http://localhost:4010/mcp
- Health: http://localhost:4010/health

### Production (Hostinger Web/Cloud — Node.js Web App)

Not VPS. Use **Deploy Web App** with GitHub:

| Setting | Value |
| --- | --- |
| Framework | **Fastify** (or Other) |
| Build command | `npm run build` |
| Output directory (if shown) | `.` (project root); Fastify preset may omit this field |
| Entry file | `server.js` |
| Node.js | **22.x** |

Environment variables (same as Netlify + runtime):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (build-time)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `MCP_SUPABASE_EMAIL` + `MCP_SUPABASE_PASSWORD`)
- `MCP_PUBLIC_URL=https://YOUR_DOMAIN/mcp`
- `OAUTH_SIGNING_SECRET` (recommended)

Local production smoke test:

```bash
npm run build && npm start
# open http://localhost:4010  and  http://localhost:4010/health
```

The build compiles the Fastify server to `dist-server/`. `server.js` loads that compiled server, which serves the Vite SPA from `dist/` and the MCP/OAuth routes on the same host (`/mcp`, `/authorize`, …). `server.mjs` remains a compatibility alias for older deployments.

For Hostinger, the deployment output must include `server.js`, `dist-server/`,
`dist/`, and the production dependencies together. `dist/` alone is a static
frontend build and does not contain the Node.js entry file or backend. Keep
the framework set to **Fastify**, with project root `./` and entry file
`server.js`. The `netlify.toml` file applies only to Netlify deployments.
## Demo logins (development seed)

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@nahdha.local` | `NahdhaAdmin2026!` |
| Admin | `rahma@nahdha.local` | `RahmaAdmin2026!` |
| Doctor | `doctor@nahdha.local` | `NahdhaDoctor2026!` |
| Staff | `staff@nahdha.local` | `NahdhaStaff2026!` |
| Viewer | `viewer@nahdha.local` | `NahdhaViewer2026!` |

Seed data is marked `is_seed = true`. Remove it with `supabase/seed/clean.sql`.

## MCP (Mazen)

1. Create a client in **Settings → MCP**, or use the development Mazen client.
2. Copy the token **once**. It is stored hashed.
3. Connect Mazen / Hermes with **OAuth auth** (recommended). Do **not** put the token in JSON:

```json
{
  "mcpServers": {
    "nahdha-crm": {
      "url": "http://localhost:4010/mcp"
    }
  }
}
```

After save, Hermes opens the authorize page. Sign in with an **admin** CRM account (email/password), or paste a valid MCP client token from Settings.

Production (after Hostinger deploy):

```json
{
  "mcpServers": {
    "nahdha-crm": {
      "url": "https://YOUR_DOMAIN/mcp"
    }
  }
}
```

Legacy static Bearer still works if you prefer headers, but OAuth is preferred.

Development seed token (rotate before production):

`ndh_live_492cd188e6ada39ed206e8e6b87e2433a6315cd2f8f339dc`

Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` for the MCP process only. Never put the service role in Vite/`VITE_` variables.

If the service role is not available locally, set `MCP_SUPABASE_EMAIL` and `MCP_SUPABASE_PASSWORD` to an **admin** CRM user. The MCP server then uses that session plus `mcp_authenticate` — still not unrestricted SQL.

The MCP server uses the same CRM operations (search, profile, create/update, notes, medications, messages). It does not run unrestricted SQL.

## Roles

| Role | Access |
| --- | --- |
| Admin | Full |
| Doctor | Patients, medications, conditions, notes |
| Staff | Patients, messages, notes |
| Viewer | Read only |

Enforced in the UI, Postgres RLS, and MCP permissions.

## Mazen authorization and notification workflow

- OAuth scope is `mcp:tools`. Read/write access is controlled separately by each active MCP client's permissions in **Settings → MCP**. A scope is not a replacement for `patients.write`, `messages.write`, etc.
- `non-interactive environment and no cached tokens found` comes from Hermes before authorization completes. Finish OAuth interactively in the **same remote Hermes profile** used by the gateway, or configure its supported Bearer credential mechanism there. Creating a CRM client does not populate the remote profile's OAuth cache. Never commit the token or paste it into chat.
- OAuth signing uses `OAUTH_SIGNING_SECRET` when configured, otherwise a random key stored in an admin-only RLS table (never the anon key or login password). Registrations, used authorization codes and revocations now persist across restarts. Clients must re-register and authorize after this upgrade; older uncached registrations are rejected. Disabled clients and changed permissions apply to existing access tokens immediately.
- Patient fields: `civil_id`, `file_number`, `communication_consent` (`unknown`, `granted`, `denied`), `phone_status` (`unknown`, `valid`, `invalid`, `unreachable`). Existing records default to unknown, not consented. IDs remain text to preserve leading zeros.
- `notification_campaign_create` stores a campaign and per-patient consent/delivery records transactionally. Supply a stable `idempotency_key`, message, audience, and `scheduled_at` with an explicit timezone offset, e.g. `2026-09-24T09:00:00+04:00`, `timezone: Asia/Muscat`. Category, condition and explicit patient filters intersect. Medication is campaign context when another audience filter is supplied; alone it targets active patients linked to that medication.
- A Hermes scheduler or messaging connector must call `notification_claim_due`, send the returned messages through its provider using `delivery_id` as the provider idempotency key, then call `notification_delivery_result`. CRM scheduling alone does not send WhatsApp/SMS. Current consent and phone validity are checked at claim time. Unknown/denied consent is skipped. Uncertain sends remain `sending`; reconcile their provider receipt instead of blindly retrying.
- `sent` requires a real provider message ID. A failed send requires a reason. Each result writes the outgoing message, timestamps, and an activity log in one transaction. Inspect campaigns and recipients in **Messages → Notification campaigns**, or `notification_campaign_get`; inspect MCP results with `mcp_audit_list`.
- `npm run test:mcp:workflows` uses isolated, clearly marked synthetic database records. It never calls a messaging provider; its test receipt is explicitly simulated. It verifies read-back, consent changes, concurrent claims, idempotency, OAuth/PKCE, code replay, revocation and read-only permissions. Test patients are archived and test credentials disabled in cleanup. Set `MCP_TEST_ORIGIN` to test the deployed HTTP endpoint after applying migrations.
