import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCrmSupabase } from "./supabase.ts";

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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const runtimeEmail = process.env.MCP_SUPABASE_EMAIL;
const runtimePassword = process.env.MCP_SUPABASE_PASSWORD;

let client: SupabaseClient | null = null;
let backendMode: "service_role" | "user" | null = null;
let signingIn: Promise<string | null> | null = null;

export function hasServiceRole() {
  return backendMode !== null;
}

export function backendModeLabel() {
  return backendMode;
}

async function signInAsRuntimeUser() {
  if (!url || !anonKey || !runtimeEmail || !runtimePassword) return null;
  const userClient = createCrmSupabase(url, anonKey, { persistSession: false, autoRefreshToken: true });
  const { error } = await userClient.auth.signInWithPassword({ email: runtimeEmail, password: runtimePassword });
  if (error) throw new Error(`MCP backend login failed: ${error.message}`);
  client = userClient;
  backendMode = "user";
  return backendMode;
}

export async function initCrmClient() {
  if (!url) throw new Error("SUPABASE_URL is required for the MCP server");
  if (serviceKey) {
    client = createCrmSupabase(url, serviceKey, { persistSession: false, autoRefreshToken: false });
    backendMode = "service_role";
    return backendMode;
  }
  if (anonKey && runtimeEmail && runtimePassword) {
    signingIn ??= signInAsRuntimeUser().finally(() => {
      signingIn = null;
    });
    return signingIn;
  }
  return null;
}

export async function ensureCrmBackend() {
  if (backendMode === "service_role" && client) return backendMode;
  if (backendMode === "user" && client) {
    const { data } = await client.auth.getSession();
    if (data.session) return backendMode;
  }
  return initCrmClient();
}

export function adminClient(): SupabaseClient {
  if (!client) {
    throw new Error("MCP backend is not initialized. Set SUPABASE_SERVICE_ROLE_KEY or MCP_SUPABASE_EMAIL/PASSWORD.");
  }
  return client;
}

export const ALL_PERMISSIONS = [
  "patients.read",
  "patients.write",
  "messages.read",
  "messages.write",
  "medications.read",
  "medications.write",
  "conditions.read",
  "conditions.write",
  "notes.read",
  "notes.write",
  "categories.read",
  "categories.write",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export type McpActor = {
  id: string;
  name: string;
  permissions: string[];
};

export async function authenticateToken(token: string): Promise<McpActor | null> {
  await ensureCrmBackend();
  const db = adminClient();
  let { data, error } = await db.rpc("mcp_authenticate", { p_token: token });
  if ((error || !data) && backendMode === "user") {
    await initCrmClient();
    ({ data, error } = await adminClient().rpc("mcp_authenticate", { p_token: token }));
  }
  if (error || !data) return null;
  const row = data as { id: string; name: string; permissions?: string[] };
  if (!row.id) return null;
  return { id: row.id, name: row.name, permissions: row.permissions ?? [] };
}

export function requirePermission(actor: McpActor, permission: Permission) {
  if (!actor.permissions.includes(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

export async function logMcp(
  actor: McpActor,
  tool: string,
  success: boolean,
  extra?: { action?: string; entityType?: string; entityId?: string; error?: string },
) {
  const db = adminClient();
  const { error: logError } = await db.from("mcp_logs").insert({
    client_id: actor.id,
    tool,
    action: extra?.action ?? tool,
    entity_type: extra?.entityType ?? null,
    entity_id: extra?.entityId ?? null,
    success,
    error: extra?.error ?? null,
    metadata: { client: actor.name },
  });
  if (logError) throw logError;
  await db
    .from("mcp_clients")
    .update({ last_used_at: new Date().toISOString(), last_tool_call: tool })
    .eq("id", actor.id);
}

export async function logActivity(action: string, entityType: string, entityId: string | null, actor: McpActor, metadata: Record<string, unknown> = {}) {
  const db = adminClient();
  await db.rpc("log_activity", {
    p_actor_type: "mcp",
    p_actor_id: actor.id,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: { client: actor.name, ...metadata },
  });
}

export const crm = {
  async patientsList(input: { limit?: number; offset?: number; category?: string; status?: string }) {
    const db = adminClient();
    const { data, error } = await db.rpc("search_patients", {
      p_category: input.category ?? null,
      p_status: input.status ?? null,
      p_limit: input.limit ?? 50,
      p_offset: input.offset ?? 0,
    });
    if (error) throw error;
    return data;
  },
  async patientsSearch(input: {
    query?: string;
    category?: string;
    medication?: string;
    status?: string;
    last_contact_from?: string;
    last_contact_to?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = adminClient();
    const { data, error } = await db.rpc("search_patients", {
      p_query: input.query ?? null,
      p_category: input.category ?? null,
      p_medication: input.medication ?? null,
      p_status: input.status ?? null,
      p_last_contact_from: input.last_contact_from ?? null,
      p_last_contact_to: input.last_contact_to ?? null,
      p_limit: input.limit ?? 50,
      p_offset: input.offset ?? 0,
    });
    if (error) throw error;
    return data;
  },
  async patientGet(input: { patient_id?: string; phone?: string }) {
    const db = adminClient();
    if (input.patient_id) {
      const { data, error } = await db.from("patients").select("*, categories(*)").eq("id", input.patient_id).maybeSingle();
      if (error) throw error;
      return data;
    }
    if (input.phone) {
      const { data, error } = await db.rpc("patient_full_profile", { p_phone: input.phone });
      if (error) throw error;
      return data;
    }
    throw new Error("patient_id or phone is required");
  },
  async patientCreate(actor: McpActor, input: Record<string, unknown>) {
    const db = adminClient();
    const { data, error } = await db
      .from("patients")
      .insert({
        full_name: input.full_name,
        primary_phone: input.primary_phone,
        secondary_phone: input.secondary_phone ?? null,
        email: input.email ?? null,
        status: input.status ?? "active",
        category_id: input.category_id ?? null,
        civil_id: input.civil_id ?? null,
        file_number: input.file_number ?? null,
        communication_consent: input.communication_consent ?? "unknown",
        phone_status: input.phone_status ?? "unknown",
      })
      .select("*")
      .single();
    if (error) throw error;
    await db.rpc("link_patient_messages", { p_patient_id: data.id });
    await logActivity("patient.created", "patient", data.id, actor);
    return data;
  },
  async patientUpdate(actor: McpActor, input: { patient_id: string } & Record<string, unknown>) {
    const db = adminClient();
    const { patient_id } = input;
    const fields = ["full_name", "primary_phone", "secondary_phone", "email", "status", "category_id", "civil_id", "file_number", "communication_consent", "phone_status"];
    const rest = Object.fromEntries(Object.entries(input).filter(([key]) => fields.includes(key)));
    const { data, error } = await db.from("patients").update(rest).eq("id", patient_id).select("*").single();
    if (error) throw error;
    await logActivity("patient.updated", "patient", patient_id, actor);
    return data;
  },
  async patientArchive(actor: McpActor, patientId: string) {
    const db = adminClient();
    const { data, error } = await db
      .from("patients")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", patientId)
      .select("*")
      .single();
    if (error) throw error;
    await logActivity("record.archived", "patient", patientId, actor);
    return data;
  },
  async patientFullProfile(input: { patient_id?: string; phone?: string }) {
    const db = adminClient();
    const { data, error } = await db.rpc("patient_full_profile", {
      p_patient_id: input.patient_id ?? null,
      p_phone: input.phone ?? null,
    });
    if (error) throw error;
    return data;
  },
  async medicationsList() {
    const db = adminClient();
    const { data, error } = await db.from("medications").select("*").order("name");
    if (error) throw error;
    return data;
  },
  async medicationsSearch(query: string) {
    const db = adminClient();
    const { data, error } = await db
      .from("medications")
      .select("*")
      .or(`name.ilike.%${query}%,generic_name.ilike.%${query}%`)
      .limit(50);
    if (error) throw error;
    return data;
  },
  async medicationGet(id: string) {
    const db = adminClient();
    const { data, error } = await db.from("medications").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async medicationCreate(actor: McpActor, input: Record<string, unknown>) {
    const db = adminClient();
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("name is required");
    const { data, error } = await db
      .from("medications")
      .insert({
        name,
        generic_name: input.generic_name ? String(input.generic_name) : null,
        category: input.category ? String(input.category) : null,
        notes: input.notes ? String(input.notes) : null,
        status: input.status ? String(input.status) : "active",
      })
      .select("*")
      .single();
    if (error) throw error;
    await logActivity("medication.catalog_created", "medication", data.id, actor);
    return data;
  },
  async medicationUpdate(actor: McpActor, id: string, patch: Record<string, unknown>) {
    const db = adminClient();
    const { data, error } = await db.from("medications").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    await logActivity("medication.catalog_updated", "medication", id, actor);
    return data;
  },
  async findOrCreateMedication(actor: McpActor, input: { medication_id?: string; name?: string; generic_name?: string }) {
    const db = adminClient();
    if (input.medication_id) {
      const existing = await this.medicationGet(input.medication_id);
      if (!existing) throw new Error(`Medication not found: ${input.medication_id}`);
      return { medication: existing, created: false };
    }
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("medication_id or name is required");
    const { data: byName, error: searchError } = await db.from("medications").select("*").ilike("name", name).limit(1).maybeSingle();
    if (searchError) throw searchError;
    if (byName) return { medication: byName, created: false };
    const created = await this.medicationCreate(actor, {
      name,
      generic_name: input.generic_name ?? null,
    });
    return { medication: created, created: true };
  },
  async patientMedicationsList(patientId: string) {
    const db = adminClient();
    const { data, error } = await db.from("patient_medications").select("*, medications(*)").eq("patient_id", patientId);
    if (error) throw error;
    return data;
  },
  async patientMedicationAdd(actor: McpActor, input: Record<string, unknown>) {
    const db = adminClient();
    const patientId = String(input.patient_id ?? "");
    if (!patientId) throw new Error("patient_id is required");
    const { medication, created: catalogCreated } = await this.findOrCreateMedication(actor, {
      medication_id: input.medication_id ? String(input.medication_id) : undefined,
      name: input.medication_name ? String(input.medication_name) : input.name ? String(input.name) : undefined,
      generic_name: input.generic_name ? String(input.generic_name) : undefined,
    });
    const row = {
      patient_id: patientId,
      medication_id: medication.id,
      dosage: input.dosage ?? null,
      frequency: input.frequency ?? null,
      start_date: input.start_date ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "active",
    };
    const { data, error } = await db.from("patient_medications").insert(row).select("*, medications(*)").single();
    if (error) throw error;
    await logActivity("medication.added", "patient", patientId, actor, {
      medication_id: medication.id,
      catalog_created: catalogCreated,
    });
    return { ...data, catalog_created: catalogCreated };
  },
  async patientMedicationUpdate(actor: McpActor, id: string, patch: Record<string, unknown>) {
    const db = adminClient();
    const { data, error } = await db.from("patient_medications").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    await logActivity("medication.updated", "patient_medication", id, actor);
    return data;
  },
  async patientMedicationRemove(actor: McpActor, id: string) {
    const db = adminClient();
    const { data, error } = await db
      .from("patient_medications")
      .update({ status: "discontinued", end_date: new Date().toISOString().slice(0, 10) })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    await logActivity("medication.removed", "patient_medication", id, actor);
    return data;
  },
  async conditionsList() {
    const db = adminClient();
    const { data, error } = await db.from("conditions").select("*").order("name_en");
    if (error) throw error;
    return data;
  },
  async conditionCreate(actor: McpActor, input: Record<string, unknown>) {
    const db = adminClient();
    const nameEn = String(input.name_en ?? input.name ?? "").trim();
    const nameAr = String(input.name_ar ?? nameEn).trim();
    if (!nameEn) throw new Error("name_en is required");
    const { data, error } = await db
      .from("conditions")
      .insert({
        name_en: nameEn,
        name_ar: nameAr,
        status: input.status ? String(input.status) : "active",
      })
      .select("*")
      .single();
    if (error) throw error;
    await logActivity("condition.catalog_created", "condition", data.id, actor);
    return data;
  },
  async conditionUpdate(actor: McpActor, id: string, patch: Record<string, unknown>) {
    const db = adminClient();
    const { data, error } = await db.from("conditions").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    await logActivity("condition.catalog_updated", "condition", id, actor);
    return data;
  },
  async findOrCreateCondition(
    actor: McpActor,
    input: { condition_id?: string; name_en?: string; name_ar?: string; name?: string },
  ) {
    const db = adminClient();
    if (input.condition_id) {
      const { data, error } = await db.from("conditions").select("*").eq("id", input.condition_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`Condition not found: ${input.condition_id}`);
      return { condition: data, created: false };
    }
    const nameEn = String(input.name_en ?? input.name ?? "").trim();
    if (!nameEn) throw new Error("condition_id or name_en/name is required");
    const { data: byEn, error: enErr } = await db.from("conditions").select("*").ilike("name_en", nameEn).limit(1).maybeSingle();
    if (enErr) throw enErr;
    if (byEn) return { condition: byEn, created: false };
    const { data: byAr, error: arErr } = await db.from("conditions").select("*").ilike("name_ar", nameEn).limit(1).maybeSingle();
    if (arErr) throw arErr;
    if (byAr) return { condition: byAr, created: false };
    const created = await this.conditionCreate(actor, {
      name_en: nameEn,
      name_ar: input.name_ar ?? nameEn,
    });
    return { condition: created, created: true };
  },
  async patientConditionsList(patientId: string) {
    const db = adminClient();
    const { data, error } = await db.from("patient_conditions").select("*, conditions(*)").eq("patient_id", patientId);
    if (error) throw error;
    return data;
  },
  async patientConditionAdd(actor: McpActor, input: Record<string, unknown>) {
    const db = adminClient();
    const patientId = String(input.patient_id ?? "");
    if (!patientId) throw new Error("patient_id is required");
    const { condition, created: catalogCreated } = await this.findOrCreateCondition(actor, {
      condition_id: input.condition_id ? String(input.condition_id) : undefined,
      name_en: input.name_en ? String(input.name_en) : input.condition_name ? String(input.condition_name) : input.name ? String(input.name) : undefined,
      name_ar: input.name_ar ? String(input.name_ar) : undefined,
    });
    const row = {
      patient_id: patientId,
      condition_id: condition.id,
      notes: input.notes ?? null,
      status: input.status ?? "active",
    };
    const { data, error } = await db.from("patient_conditions").insert(row).select("*, conditions(*)").single();
    if (error) throw error;
    await logActivity("condition.added", "patient", patientId, actor, {
      condition_id: condition.id,
      catalog_created: catalogCreated,
    });
    return { ...data, catalog_created: catalogCreated };
  },
  async patientConditionUpdate(_actor: McpActor, id: string, patch: Record<string, unknown>) {
    const db = adminClient();
    const { data, error } = await db.from("patient_conditions").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async patientConditionRemove(actor: McpActor, id: string) {
    const db = adminClient();
    const { error } = await db.from("patient_conditions").delete().eq("id", id);
    if (error) throw error;
    await logActivity("condition.removed", "patient_condition", id, actor);
    return { ok: true };
  },
  async patientNotesList(patientId: string) {
    const db = adminClient();
    const { data, error } = await db.from("notes").select("*").eq("patient_id", patientId).is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async patientNoteAdd(actor: McpActor, input: { patient_id: string; body: string }) {
    const db = adminClient();
    const { data, error } = await db.from("notes").insert(input).select("*").single();
    if (error) throw error;
    await logActivity("note.added", "patient", input.patient_id, actor);
    return data;
  },
  async patientNoteUpdate(actor: McpActor, id: string, body: string) {
    const db = adminClient();
    const { data, error } = await db.from("notes").update({ body }).eq("id", id).select("*").single();
    if (error) throw error;
    await logActivity("note.updated", "note", id, actor);
    return data;
  },
  async messagesList(limit = 50) {
    const db = adminClient();
    const { data, error } = await db.from("messages").select("*, patients(id, full_name)").order("received_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  },
  async patientMessagesList(patientId: string) {
    const db = adminClient();
    const { data, error } = await db.from("messages").select("*").eq("patient_id", patientId).order("received_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async messageCreate(actor: McpActor, input: Record<string, unknown>) {
    const db = adminClient();
    const payload = { ...input };
    if (input.status === "sent") {
      if (input.direction !== "outgoing" || !input.external_message_id) throw new Error("sent requires an outgoing message and a real provider receipt");
      payload.sent_at = input.sent_at ?? new Date().toISOString();
    }
    if (input.status === "failed") {
      if (!input.delivery_error) throw new Error("failed requires delivery_error");
      payload.failed_at = input.failed_at ?? new Date().toISOString();
    }
    const { data, error } = await db.from("messages").insert(payload).select("*").single();
    if (error) throw error;
    await logActivity("message.created", "message", data.id, actor, { patient_id: data.patient_id });
    return data;
  },
  async messageGet(id: string) {
    const db = adminClient();
    const { data, error } = await db.from("messages").select("*, patients(id, full_name)").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async categoriesList() {
    const db = adminClient();
    const { data, error } = await db.from("categories").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },
  async categoryGet(id: string) {
    const db = adminClient();
    const { data, error } = await db.from("categories").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async categoryCreate(actor: McpActor, input: Record<string, unknown>) {
    const db = adminClient();
    const nameEn = String(input.name_en ?? "").trim();
    const nameAr = String(input.name_ar ?? nameEn).trim();
    const slug = String(input.slug ?? nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).trim();
    if (!nameEn || !slug) throw new Error("name_en and slug are required");
    const { data, error } = await db
      .from("categories")
      .insert({
        slug,
        name_en: nameEn,
        name_ar: nameAr,
        color: input.color ? String(input.color) : null,
        sort_order: typeof input.sort_order === "number" ? input.sort_order : 0,
        status: input.status ? String(input.status) : "active",
      })
      .select("*")
      .single();
    if (error) throw error;
    await logActivity("category.created", "category", data.id, actor);
    return data;
  },
  async categoryUpdate(actor: McpActor, id: string, patch: Record<string, unknown>) {
    const db = adminClient();
    const { data, error } = await db.from("categories").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    await logActivity("category.updated", "category", id, actor);
    return data;
  },
  async resolveCategoryId(input: { category_id?: string; category_slug?: string }) {
    if (input.category_id) return input.category_id;
    if (!input.category_slug) return null;
    const db = adminClient();
    const { data, error } = await db.from("categories").select("id").eq("slug", input.category_slug).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Category not found for slug: ${input.category_slug}`);
    return data.id as string;
  },
  async patientCategorySet(actor: McpActor, patientId: string, categoryId: string) {
    const db = adminClient();
    const { data, error } = await db.from("patients").update({ category_id: categoryId }).eq("id", patientId).select("*").single();
    if (error) throw error;
    await logActivity("category.changed", "patient", patientId, actor, { category_id: categoryId });
    return data;
  },
  async patientRecordInteraction(
    actor: McpActor,
    input: {
      patient_id?: string;
      phone?: string;
      full_name?: string;
      civil_id?: string;
      file_number?: string;
      communication_consent?: string;
      phone_status?: string;
      message?: { direction?: string; message_body?: string; phone_number?: string };
      note?: string;
      medications?: Array<Record<string, unknown>>;
      conditions?: Array<Record<string, unknown>>;
      category_id?: string;
      category_slug?: string;
    },
  ) {
    const db = adminClient();
    const summary: {
      patient: Record<string, unknown> | null;
      patient_created: boolean;
      message: unknown;
      note: unknown;
      medications: unknown[];
      conditions: unknown[];
      category: unknown;
    } = {
      patient: null,
      patient_created: false,
      message: null,
      note: null,
      medications: [],
      conditions: [],
      category: null,
    };

    let patientId = input.patient_id ? String(input.patient_id) : "";
    let phone = input.phone ? String(input.phone).trim() : "";

    if (!patientId && phone) {
      const { data: existing, error } = await db.from("patients").select("*").eq("primary_phone", phone).maybeSingle();
      if (error) throw error;
      if (existing) {
        patientId = existing.id;
        summary.patient = existing;
      }
    }

    if (!patientId) {
      if (!phone) throw new Error("patient_id or phone is required");
      requirePermission(actor, "patients.write");
      const fullName = String(input.full_name ?? "Unknown patient").trim() || "Unknown patient";
      const created = await this.patientCreate(actor, { ...input, full_name: fullName, primary_phone: phone });
      patientId = created.id;
      phone = created.primary_phone;
      summary.patient = created;
      summary.patient_created = true;
    } else if (!summary.patient) {
      const { data, error } = await db.from("patients").select("*").eq("id", patientId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`Patient not found: ${patientId}`);
      summary.patient = data;
      phone = phone || String(data.primary_phone ?? "");
    }

    const details = Object.fromEntries(["civil_id", "file_number", "communication_consent", "phone_status"].filter((key) => key in input).map((key) => [key, input[key as keyof typeof input]]));
    if (Object.keys(details).length && !summary.patient_created) {
      requirePermission(actor, "patients.write");
      summary.patient = await this.patientUpdate(actor, { patient_id: patientId, ...details });
    }

    if (input.message?.message_body) {
      requirePermission(actor, "messages.write");
      summary.message = await this.messageCreate(actor, {
        patient_id: patientId,
        phone_number: input.message.phone_number || phone,
        direction: input.message.direction || "incoming",
        message_body: String(input.message.message_body),
      });
    }

    if (input.note) {
      requirePermission(actor, "notes.write");
      summary.note = await this.patientNoteAdd(actor, { patient_id: patientId, body: String(input.note) });
    }

    if (input.medications?.length) {
      requirePermission(actor, "medications.write");
      for (const med of input.medications) {
        summary.medications.push(
          await this.patientMedicationAdd(actor, {
            patient_id: patientId,
            ...med,
          }),
        );
      }
    }

    if (input.conditions?.length) {
      requirePermission(actor, "conditions.write");
      for (const cond of input.conditions) {
        summary.conditions.push(
          await this.patientConditionAdd(actor, {
            patient_id: patientId,
            ...cond,
          }),
        );
      }
    }

    const categoryId = await this.resolveCategoryId({
      category_id: input.category_id,
      category_slug: input.category_slug,
    });
    if (categoryId) {
      requirePermission(actor, "categories.write");
      summary.category = await this.patientCategorySet(actor, patientId, categoryId);
    }

    await logActivity("interaction.recorded", "patient", patientId, actor, {
      message: Boolean(summary.message),
      note: Boolean(summary.note),
      medications: summary.medications.length,
      conditions: summary.conditions.length,
      category: Boolean(summary.category),
      patient_created: summary.patient_created,
    });

    return summary;
  },
};
