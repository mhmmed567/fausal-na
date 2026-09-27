import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Missing Supabase URL or anon key");
  process.exit(1);
}

const failed: string[] = [];
function ok(name: string, pass: boolean, detail = "") {
  if (!pass) failed.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function client(): SupabaseClient {
  return createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string, password: string) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`${email}: ${error?.message ?? "no session"}`);
  return sb;
}

const phone = `+9689${String(Date.now()).slice(-7)}`;
let createdId: string | null = null;

try {
  const anonClient = client();
  const { data: leaked, error: anonError } = await anonClient.from("patients").select("id").limit(1);
  ok("anon cannot read patients", Boolean(anonError) || !leaked?.length, anonError?.message ?? "empty");

  const admin = await signIn("admin@nahdha.local", "NahdhaAdmin2026!");
  ok("admin login", true);

  const { data: stats, error: statsError } = await admin.rpc("dashboard_stats");
  ok("dashboard_stats", !statsError && stats != null, statsError?.message);

  const { data: listed, error: listError } = await admin.rpc("search_patients", { p_limit: 20 });
  ok("search patients rpc", !listError && Array.isArray(listed), listError?.message);

  const { data: created, error: createError } = await admin
    .from("patients")
    .insert({ full_name: "Test Patient Nahdha", primary_phone: phone, status: "active", is_seed: true })
    .select("id")
    .single();
  createdId = created?.id ?? null;
  ok("create patient", !createError && Boolean(createdId), createError?.message);

  if (createdId) {
    const { error: updateError } = await admin.from("patients").update({ secondary_phone: "+96890000000" }).eq("id", createdId);
    ok("update patient", !updateError, updateError?.message);

    const { data: meds } = await admin.from("medications").select("id").eq("name", "Concor").maybeSingle();
    const { error: addMedError } = await admin.from("patient_medications").insert({
      patient_id: createdId,
      medication_id: meds?.id,
      dosage: "5 mg",
      frequency: "Once daily",
      status: "active",
    });
    ok("add medication", !addMedError && Boolean(meds?.id), addMedError?.message);

    const { data: cond } = await admin.from("conditions").select("id").limit(1).maybeSingle();
    const { error: addCondError } = await admin.from("patient_conditions").insert({
      patient_id: createdId,
      condition_id: cond?.id,
      notes: "Added manually",
      status: "active",
    });
    ok("add condition", !addCondError, addCondError?.message);

    const { error: noteError } = await admin.from("notes").insert({ patient_id: createdId, body: "Follow-up after Ramadan." });
    ok("add note", !noteError, noteError?.message);

    const { data: profile, error: profileError } = await admin.rpc("patient_full_profile", { p_patient_id: createdId });
    const profilePatient = (profile as { patient?: { id?: string } } | null)?.patient;
    ok("patient_full_profile", !profileError && profilePatient?.id === createdId, profileError?.message);

    const { error: msgError } = await admin.from("messages").insert({
      phone_number: phone,
      direction: "incoming",
      message_body: "Need a refill for Concor",
      status: "new",
    });
    ok("create message", !msgError, msgError?.message);
    await admin.rpc("link_patient_messages", { p_patient_id: createdId });
    const { data: linked } = await admin.from("messages").select("patient_id").eq("phone_number", phone).maybeSingle();
    ok("message linking", linked?.patient_id === createdId);

    const { data: found } = await admin.rpc("search_patients", { p_query: phone.replace("+968", ""), p_limit: 5 });
    ok("search by phone after create", found?.[0]?.id === createdId);

    const { error: archiveError } = await admin.from("patients").update({ archived_at: new Date().toISOString() }).eq("id", createdId);
    ok("archive patient", !archiveError, archiveError?.message);
  }

  const viewer = await signIn("viewer@nahdha.local", "NahdhaViewer2026!");
  const { error: viewerWrite } = await viewer.from("patients").insert({ full_name: "Should Fail", primary_phone: "+96891111111" });
  ok("viewer cannot write patients", Boolean(viewerWrite), viewerWrite?.message);

  const staff = await signIn("staff@nahdha.local", "NahdhaStaff2026!");
  const { data: anyMed } = await admin.from("medications").select("id").limit(1).maybeSingle();
  const { error: staffMed } = await staff.from("patient_medications").insert({
    patient_id: createdId,
    medication_id: anyMed?.id,
    status: "active",
  });
  ok("staff cannot write medications", Boolean(staffMed), staffMed?.message);

  const doctor = await signIn("doctor@nahdha.local", "NahdhaDoctor2026!");
  const { error: doctorMsg } = await doctor.from("messages").insert({
    phone_number: "+96892222222",
    direction: "outgoing",
    message_body: "Should fail",
  });
  ok("doctor cannot write messages", Boolean(doctorMsg), doctorMsg?.message);
} catch (error) {
  ok("suite", false, error instanceof Error ? error.message : String(error));
} finally {
  if (createdId) {
    const admin = await signIn("admin@nahdha.local", "NahdhaAdmin2026!");
    await admin.from("notes").update({ deleted_at: new Date().toISOString() }).eq("patient_id", createdId);
    await admin.from("patient_medications").delete().eq("patient_id", createdId);
    await admin.from("patient_conditions").delete().eq("patient_id", createdId);
    await admin.from("messages").delete().eq("patient_id", createdId);
    await admin.from("patients").delete().eq("id", createdId);
  }
}

if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log("\nCRM API checks passed");
