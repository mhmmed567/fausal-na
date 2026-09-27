import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const endpoint = process.env.MCP_PUBLIC_URL || "http://localhost:4010/mcp";
const token = process.env.MCP_DEV_TOKEN || "ndh_live_492cd188e6ada39ed206e8e6b87e2433a6315cd2f8f339dc";
const failed: string[] = [];

function ok(name: string, pass: boolean, detail = "") {
  if (!pass) failed.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseBody(text: string) {
  const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
  const raw = dataLine ? dataLine.slice(5).trim() : text;
  try {
    return JSON.parse(raw) as { result?: unknown; error?: { message?: string }; id?: unknown };
  } catch {
    return { error: { message: text.slice(0, 200) } };
  }
}

async function call(method: string, params: Record<string, unknown> = {}, id = 1, auth = true) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (auth) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  return { status: res.status, body: parseBody(text), text };
}

const health = await fetch(endpoint.replace(/\/mcp$/, "/health")).then((r) => r.json()) as { ready?: boolean; backend?: string };
ok("mcp health ready", Boolean(health.ready), `backend=${health.backend ?? "none"}`);

const noAuth = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
ok("unauthenticated rejected", noAuth.status === 401, `status=${noAuth.status}`);

const bad = await call("tools/list", {}, 1, false);
ok("missing bearer rejected", bad.status === 401, `status=${bad.status}`);

const invalid = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: "Bearer ndh_live_invalidtokeninvalidtokeninvalid",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
ok("invalid token rejected", invalid.status === 401, `status=${invalid.status}`);

const init = await call("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "nahdha-test", version: "1.0.0" },
});
ok("initialize", init.status === 200 && !init.body.error, init.body.error?.message);

const listed = await call("tools/list");
const tools = (listed.body.result as { tools?: { name: string }[] } | undefined)?.tools ?? [];
ok("tools/list", listed.status === 200 && tools.length > 0, `count=${tools.length}`);
ok(
  "tools include patient_record_interaction",
  tools.some((t) => t.name === "patient_record_interaction"),
);
ok("tools include medication_create", tools.some((t) => t.name === "medication_create"));
ok("tools include condition_create", tools.some((t) => t.name === "condition_create"));
ok("tools include category_create", tools.some((t) => t.name === "category_create"));

const initInstructions = (init.body.result as { instructions?: string } | undefined)?.instructions ?? "";
ok("initialize includes CRM instructions", initInstructions.includes("patient_record_interaction"), initInstructions.slice(0, 80));

function toolPayload(body: { result?: unknown; error?: { message?: string } }) {
  const result = body.result as { content?: { type: string; text?: string }[]; isError?: boolean } | undefined;
  const text = result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { text, parsed, isError: Boolean(result?.isError), rpcError: body.error?.message };
}

const searchEmpty = await call("tools/call", { name: "patients_search", arguments: { query: "Concor", limit: 10 } });
ok("patients_search", searchEmpty.status === 200 && !searchEmpty.body.error, searchEmpty.body.error?.message);

const phone = `+9688${String(Date.now()).slice(-7)}`;
const created = await call("tools/call", {
  name: "patient_create",
  arguments: { full_name: "MCP Live Patient", primary_phone: phone },
});
const createdText = JSON.stringify(created.body.result ?? "");
const createdId = createdText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
ok("patient_create", Boolean(createdId), created.body.error?.message);

if (createdId) {
  const found = await call("tools/call", { name: "patients_search", arguments: { query: "MCP Live Patient", limit: 5 } });
  ok("patients_search finds created", found.status === 200 && JSON.stringify(found.body.result).includes(createdId), found.body.error?.message);
  const profile = await call("tools/call", { name: "patient_full_profile", arguments: { patient_id: createdId } });
  ok("patient_full_profile", profile.status === 200 && !profile.body.error, profile.body.error?.message);
  const note = await call("tools/call", { name: "patient_note_add", arguments: { patient_id: createdId, body: "Saved via MCP" } });
  ok("patient_note_add", note.status === 200 && !note.body.error, note.body.error?.message);
  const archived = await call("tools/call", { name: "patient_archive", arguments: { patient_id: createdId } });
  ok("patient_archive", archived.status === 200 && !archived.body.error, archived.body.error?.message);
}

const interactionPhone = `+9689${String(Date.now()).slice(-7)}`;
const uniqueMed = `MCPTestMed-${Date.now()}`;
const uniqueCond = `MCPTestCond-${Date.now()}`;
const interaction = await call("tools/call", {
  name: "patient_record_interaction",
  arguments: {
    phone: interactionPhone,
    full_name: "MCP Interaction Patient",
    message: { direction: "incoming", message_body: "أحتاج دواء ضغط جديد" },
    note: "Logged via patient_record_interaction",
    medications: [{ medication_name: uniqueMed, dosage: "5mg", frequency: "daily" }],
    conditions: [{ name_en: uniqueCond, name_ar: uniqueCond }],
  },
});
const interactionOut = toolPayload(interaction.body);
const interactionPatient = (interactionOut.parsed as { patient?: { id?: string }; medications?: { catalog_created?: boolean }[]; conditions?: { catalog_created?: boolean }[]; message?: unknown; note?: unknown } | null);
ok(
  "patient_record_interaction",
  interaction.status === 200 && !interactionOut.isError && Boolean(interactionPatient?.patient?.id),
  interactionOut.rpcError || interactionOut.text.slice(0, 160),
);
ok(
  "interaction auto-creates medication catalog",
  Boolean(interactionPatient?.medications?.[0]?.catalog_created),
  JSON.stringify(interactionPatient?.medications?.[0] ?? null).slice(0, 120),
);
ok(
  "interaction auto-creates condition catalog",
  Boolean(interactionPatient?.conditions?.[0]?.catalog_created),
  JSON.stringify(interactionPatient?.conditions?.[0] ?? null).slice(0, 120),
);
ok("interaction stores message", Boolean(interactionPatient?.message));
ok("interaction stores note", Boolean(interactionPatient?.note));

if (interactionPatient?.patient?.id) {
  const medSearch = await call("tools/call", { name: "medications_search", arguments: { query: uniqueMed } });
  const medOut = toolPayload(medSearch.body);
  ok(
    "medications_search finds auto-created drug",
    medSearch.status === 200 && !medOut.isError && medOut.text.includes(uniqueMed),
    medOut.text.slice(0, 120),
  );
  await call("tools/call", { name: "patient_archive", arguments: { patient_id: interactionPatient.patient.id } });
}

const logsHealth = await fetch(endpoint.replace(/\/mcp$/, "/health"));
ok("health still ok after writes", logsHealth.ok);

if (failed.length) {
  console.error(`\n${failed.length} MCP checks failed`);
  process.exit(1);
}
console.log("\nMCP checks passed");
