import { notifications } from "./notifications.ts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { adminClient, authenticateToken, crm, logMcp, requirePermission, type McpActor, type Permission } from "./crm.ts";

type ToolDef = {
  name: string;
  description: string;
  /** Single permission, or any-of list (tool is listed if actor has at least one). */
  permission: Permission | Permission[];
  inputSchema: Record<string, unknown>;
  run: (actor: McpActor, args: Record<string, unknown>) => Promise<unknown>;
};

const COMPOSITE_PERMISSIONS: Permission[] = [
  "patients.write",
  "messages.write",
  "notes.write",
  "medications.write",
  "conditions.write",
  "categories.write",
];

const MAZEN_INSTRUCTIONS = `You are connected to the Al Nahdha Pharmacy CRM (صيدلية النهضة).

After every patient interaction, you MUST persist details with tools — never reply verbally only.

Prefer patient_record_interaction in one call when you have a phone or patient_id plus any of: message, note, medications, conditions, category.

Rules:
- Record incoming/outgoing conversation text via message (or message_create).
- Save clinical/pharmacy context as notes.
- For medications: pass medication_name (or name). If the drug is not in the catalog, the server creates it then links it to the patient.
- For conditions: pass name_en / name_ar / condition_name; missing catalog entries are created automatically.
- Use patient_id or phone. If the patient does not exist and you have phone + full_name, patient_record_interaction will create them.
- Use granular tools (patient_medication_add, medication_create, etc.) when you only need one change.

Scheduling a notification only creates a queue record; it does NOT send a message. Use notification_campaign_create with an explicit ISO timestamp and timezone (Asia/Muscat by default). Never claim sent until the delivery provider confirms and notification_delivery_result is recorded. Never infer consent.

Do not diagnose; only record what staff/patient stated.`;

function actorHasPermission(actor: McpActor, permission: Permission | Permission[]) {
  const needed = Array.isArray(permission) ? permission : [permission];
  return needed.some((p) => actor.permissions.includes(p));
}

function gatePermission(actor: McpActor, permission: Permission | Permission[]) {
  if (Array.isArray(permission)) {
    if (!permission.some((p) => actor.permissions.includes(p))) {
      throw new Error(`Missing permission: one of ${permission.join(", ")}`);
    }
    return;
  }
  requirePermission(actor, permission);
}

const patientFields = {
  civil_id: { type: ["string", "null"], description: "Civil ID as text; never store in notes" },
  file_number: { type: ["string", "null"], description: "Hospital file number" },
  communication_consent: { type: "string", enum: ["unknown", "granted", "denied"], description: "Record only explicit patient consent; never infer granted" },
  phone_status: { type: "string", enum: ["unknown", "valid", "invalid", "unreachable"] },
};

const tools: ToolDef[] = [
  { name: "notification_campaign_create", permission: "messages.write", description: "Schedule a notification campaign; does not send. Use explicit ISO date/time with timezone offset. Asia/Muscat is UTC+04:00; resolve today/tomorrow before calling. Consent must be granted and phone valid. Audience filters intersect; medication is context when a category/condition/patient list is given, otherwise targets patients linked to that medication. Reuse idempotency_key only for the same request.", inputSchema: { type: "object", required: ["idempotency_key", "message_body", "scheduled_at"], properties: { idempotency_key: { type: "string" }, message_body: { type: "string" }, scheduled_at: { type: "string" }, timezone: { type: "string", default: "Asia/Muscat" }, category_id: { type: "string" }, condition_id: { type: "string" }, medication_id: { type: "string" }, patient_ids: { type: "array", items: { type: "string" } } } }, run: notifications.create },
  { name: "notification_campaigns_list", permission: "messages.read", description: "List scheduled campaigns and their status; no message is sent by this tool.", inputSchema: { type: "object", properties: {} }, run: notifications.list },
  { name: "notification_campaign_get", permission: "messages.read", description: "Read back a campaign with every target patient's consent snapshot, delivery status, send/failure time, receipt and reason.", inputSchema: { type: "object", required: ["campaign_id"], properties: { campaign_id: { type: "string" } } }, run: (_actor,args) => notifications.get(args) },
  { name: "notification_claim_due", permission: "messages.write", description: "Dispatcher only: atomically claim due deliveries after rechecking current consent. Then send through your provider using delivery_id as its idempotency key. Claimed deliveries are not retried automatically.", inputSchema: { type: "object", properties: { campaign_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } } }, run: notifications.claim },
  { name: "notification_delivery_result", permission: "messages.write", description: "Record a provider-confirmed result for a claimed delivery, persist the outgoing CRM message and audit log. sent requires the real external_message_id; failed requires error. Never invent a receipt.", inputSchema: { type: "object", required: ["delivery_id", "status"], properties: { delivery_id: { type: "string" }, status: { type: "string", enum: ["sent","failed"] }, external_message_id: { type: "string" }, error: { type: "string" } } }, run: notifications.result },
  { name: "mcp_audit_list", permission: "messages.read", description: "Read recent execution results for this MCP client, including success and entity IDs.", inputSchema: { type: "object", properties: {} }, run: async (actor) => { const { data, error } = await adminClient().from("mcp_logs").select("id,tool,success,entity_id,entity_type,error,created_at").eq("client_id",actor.id).order("created_at",{ascending:false}).limit(100); if(error) throw error; return data; } },
  {
    name: "patients_list",
    description: "List patients with optional category and status filters.",
    permission: "patients.read",
    inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, category: { type: "string" }, status: { type: "string" } } },
    run: (_a, args) => crm.patientsList(args),
  },
  {
    name: "patients_search",
    description: "Search patients by name, phone, medication, notes, or category. Supports category and medication filters.",
    permission: "patients.read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { type: "string" },
        medication: { type: "string" },
        status: { type: "string" },
        last_contact_from: { type: "string" },
        last_contact_to: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
    run: (_a, args) => crm.patientsSearch(args),
  },
  {
    name: "patient_get",
    description: "Get a patient by patient_id or phone.",
    permission: "patients.read",
    inputSchema: { type: "object", properties: { patient_id: { type: "string" }, phone: { type: "string" } } },
    run: (_a, args) => crm.patientGet({ patient_id: args.patient_id as string, phone: args.phone as string }),
  },
  {
    name: "patient_create",
    description: "Create a patient record.",
    permission: "patients.write",
    inputSchema: {
      type: "object",
      required: ["full_name", "primary_phone"],
      properties: {
        ...patientFields,
        full_name: { type: "string" },
        primary_phone: { type: "string" },
        secondary_phone: { type: "string" },
        email: { type: "string" },
        status: { type: "string" },
        category_id: { type: "string" },
      },
    },
    run: (actor, args) => crm.patientCreate(actor, args),
  },
  {
    name: "patient_update",
    description: "Update a patient record.",
    permission: "patients.write",
    inputSchema: { type: "object", required: ["patient_id"], properties: { ...patientFields, patient_id: { type: "string" }, full_name: { type: "string" }, primary_phone: { type: "string" }, secondary_phone: { type: "string" }, email: { type: "string" }, status: { type: "string" }, category_id: { type: "string" } } },
    run: (actor, args) => crm.patientUpdate(actor, args as { patient_id: string }),
  },
  {
    name: "patient_archive",
    description: "Archive a patient.",
    permission: "patients.write",
    inputSchema: { type: "object", required: ["patient_id"], properties: { patient_id: { type: "string" } } },
    run: (actor, args) => crm.patientArchive(actor, String(args.patient_id)),
  },
  {
    name: "patient_full_profile",
    description: "Return patient info, medications, conditions, notes, recent messages, category, and recent activity in one call.",
    permission: "patients.read",
    inputSchema: { type: "object", properties: { patient_id: { type: "string" }, phone: { type: "string" } } },
    run: (_a, args) => crm.patientFullProfile({ patient_id: args.patient_id as string, phone: args.phone as string }),
  },
  {
    name: "patient_record_interaction",
    description:
      "Preferred: record a full patient interaction in one call — message, note, medications (by name or id; auto-creates catalog entries), conditions (by name or id), and optional category. Creates the patient if phone + full_name and no match.",
    permission: COMPOSITE_PERMISSIONS,
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
        phone: { type: "string" },
        ...patientFields,
        full_name: { type: "string", description: "Used when creating a new patient by phone" },
        message: {
          type: "object",
          properties: {
            direction: { type: "string", description: "incoming or outgoing" },
            message_body: { type: "string" },
            phone_number: { type: "string" },
          },
        },
        note: { type: "string" },
        medications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              medication_id: { type: "string" },
              medication_name: { type: "string" },
              name: { type: "string" },
              dosage: { type: "string" },
              frequency: { type: "string" },
              start_date: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        conditions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              condition_id: { type: "string" },
              condition_name: { type: "string" },
              name: { type: "string" },
              name_en: { type: "string" },
              name_ar: { type: "string" },
              notes: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        category_id: { type: "string" },
        category_slug: { type: "string" },
      },
    },
    run: (actor, args) =>
      crm.patientRecordInteraction(actor, {
        patient_id: args.patient_id as string | undefined,
        phone: args.phone as string | undefined,
        full_name: args.full_name as string | undefined,
        ...Object.fromEntries(Object.keys(patientFields).filter((key) => key in args).map((key) => [key, args[key]])),
        message: args.message as { direction?: string; message_body?: string; phone_number?: string } | undefined,
        note: args.note as string | undefined,
        medications: args.medications as Array<Record<string, unknown>> | undefined,
        conditions: args.conditions as Array<Record<string, unknown>> | undefined,
        category_id: args.category_id as string | undefined,
        category_slug: args.category_slug as string | undefined,
      }),
  },
  {
    name: "medications_list",
    description: "List medication catalog.",
    permission: "medications.read",
    inputSchema: { type: "object", properties: {} },
    run: () => crm.medicationsList(),
  },
  {
    name: "medications_search",
    description: "Search medications by name or generic name.",
    permission: "medications.read",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
    run: (_a, args) => crm.medicationsSearch(String(args.query)),
  },
  {
    name: "medication_get",
    description: "Get a medication by id.",
    permission: "medications.read",
    inputSchema: { type: "object", required: ["medication_id"], properties: { medication_id: { type: "string" } } },
    run: (_a, args) => crm.medicationGet(String(args.medication_id)),
  },
  {
    name: "medication_create",
    description: "Create a medication in the catalog.",
    permission: "medications.write",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        generic_name: { type: "string" },
        category: { type: "string" },
        notes: { type: "string" },
        status: { type: "string" },
      },
    },
    run: (actor, args) => crm.medicationCreate(actor, args),
  },
  {
    name: "medication_update",
    description: "Update a medication catalog entry.",
    permission: "medications.write",
    inputSchema: {
      type: "object",
      required: ["medication_id"],
      properties: {
        medication_id: { type: "string" },
        name: { type: "string" },
        generic_name: { type: "string" },
        category: { type: "string" },
        notes: { type: "string" },
        status: { type: "string" },
      },
    },
    run: (actor, args) => {
      const { medication_id, ...patch } = args;
      return crm.medicationUpdate(actor, String(medication_id), patch);
    },
  },
  {
    name: "patient_medications_list",
    description: "List medications linked to a patient.",
    permission: "medications.read",
    inputSchema: { type: "object", required: ["patient_id"], properties: { patient_id: { type: "string" } } },
    run: (_a, args) => crm.patientMedicationsList(String(args.patient_id)),
  },
  {
    name: "patient_medication_add",
    description:
      "Add a medication to a patient. Pass medication_id or medication_name/name. If the name is not in the catalog, it is created then linked. Does not diagnose.",
    permission: "medications.write",
    inputSchema: {
      type: "object",
      required: ["patient_id"],
      properties: {
        patient_id: { type: "string" },
        medication_id: { type: "string" },
        medication_name: { type: "string" },
        name: { type: "string" },
        dosage: { type: "string" },
        frequency: { type: "string" },
        start_date: { type: "string" },
        notes: { type: "string" },
      },
    },
    run: (actor, args) => crm.patientMedicationAdd(actor, args),
  },
  {
    name: "patient_medication_update",
    description: "Update a patient medication link.",
    permission: "medications.write",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, dosage: { type: "string" }, frequency: { type: "string" }, status: { type: "string" }, notes: { type: "string" }, end_date: { type: "string" } } },
    run: (actor, args) => {
      const { id, ...patch } = args;
      return crm.patientMedicationUpdate(actor, String(id), patch);
    },
  },
  {
    name: "patient_medication_remove",
    description: "Discontinue a patient medication.",
    permission: "medications.write",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    run: (actor, args) => crm.patientMedicationRemove(actor, String(args.id)),
  },
  {
    name: "conditions_list",
    description: "List condition catalog.",
    permission: "conditions.read",
    inputSchema: { type: "object", properties: {} },
    run: () => crm.conditionsList(),
  },
  {
    name: "condition_create",
    description: "Create a condition in the catalog.",
    permission: "conditions.write",
    inputSchema: {
      type: "object",
      required: ["name_en"],
      properties: {
        name_en: { type: "string" },
        name_ar: { type: "string" },
        status: { type: "string" },
      },
    },
    run: (actor, args) => crm.conditionCreate(actor, args),
  },
  {
    name: "condition_update",
    description: "Update a condition catalog entry.",
    permission: "conditions.write",
    inputSchema: {
      type: "object",
      required: ["condition_id"],
      properties: {
        condition_id: { type: "string" },
        name_en: { type: "string" },
        name_ar: { type: "string" },
        status: { type: "string" },
      },
    },
    run: (actor, args) => {
      const { condition_id, ...patch } = args;
      return crm.conditionUpdate(actor, String(condition_id), patch);
    },
  },
  {
    name: "patient_conditions_list",
    description: "List conditions for a patient.",
    permission: "conditions.read",
    inputSchema: { type: "object", required: ["patient_id"], properties: { patient_id: { type: "string" } } },
    run: (_a, args) => crm.patientConditionsList(String(args.patient_id)),
  },
  {
    name: "patient_condition_add",
    description:
      "Add a condition to a patient. Pass condition_id or name_en/condition_name/name. Missing catalog entries are created automatically.",
    permission: "conditions.write",
    inputSchema: {
      type: "object",
      required: ["patient_id"],
      properties: {
        patient_id: { type: "string" },
        condition_id: { type: "string" },
        condition_name: { type: "string" },
        name: { type: "string" },
        name_en: { type: "string" },
        name_ar: { type: "string" },
        notes: { type: "string" },
        status: { type: "string" },
      },
    },
    run: (actor, args) => crm.patientConditionAdd(actor, args),
  },
  {
    name: "patient_condition_update",
    description: "Update a patient condition.",
    permission: "conditions.write",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, status: { type: "string" }, notes: { type: "string" } } },
    run: (actor, args) => {
      const { id, ...patch } = args;
      return crm.patientConditionUpdate(actor, String(id), patch);
    },
  },
  {
    name: "patient_condition_remove",
    description: "Remove a patient condition.",
    permission: "conditions.write",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    run: (actor, args) => crm.patientConditionRemove(actor, String(args.id)),
  },
  {
    name: "patient_notes_list",
    description: "List notes for a patient.",
    permission: "notes.read",
    inputSchema: { type: "object", required: ["patient_id"], properties: { patient_id: { type: "string" } } },
    run: (_a, args) => crm.patientNotesList(String(args.patient_id)),
  },
  {
    name: "patient_note_add",
    description: "Add a note to a patient.",
    permission: "notes.write",
    inputSchema: { type: "object", required: ["patient_id", "body"], properties: { patient_id: { type: "string" }, body: { type: "string" } } },
    run: (actor, args) => crm.patientNoteAdd(actor, { patient_id: String(args.patient_id), body: String(args.body) }),
  },
  {
    name: "patient_note_update",
    description: "Update a patient note.",
    permission: "notes.write",
    inputSchema: { type: "object", required: ["id", "body"], properties: { id: { type: "string" }, body: { type: "string" } } },
    run: (actor, args) => crm.patientNoteUpdate(actor, String(args.id), String(args.body)),
  },
  {
    name: "messages_list",
    description: "List recent messages, including unlinked numbers.",
    permission: "messages.read",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    run: (_a, args) => crm.messagesList(Number(args.limit ?? 50)),
  },
  {
    name: "patient_messages_list",
    description: "List messages for a patient.",
    permission: "messages.read",
    inputSchema: { type: "object", required: ["patient_id"], properties: { patient_id: { type: "string" } } },
    run: (_a, args) => crm.patientMessagesList(String(args.patient_id)),
  },
  {
    name: "message_create",
    description: "Record an incoming or outgoing message; this does not send it. sent requires an actual provider receipt (external_message_id); failed requires delivery_error. Links to an existing patient by phone when possible.",
    permission: "messages.write",
    inputSchema: { type: "object", required: ["phone_number", "direction", "message_body"], properties: { phone_number: { type: "string" }, direction: { type: "string" }, message_body: { type: "string" }, patient_id: { type: "string" }, status: { type: "string", enum: ["new", "read", "sent", "failed"] }, external_message_id: { type: "string" }, sent_at: { type: "string" }, failed_at: { type: "string" }, delivery_error: { type: "string" } } },
    run: (actor, args) => crm.messageCreate(actor, args),
  },
  {
    name: "message_get",
    description: "Get a message by id.",
    permission: "messages.read",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    run: (_a, args) => crm.messageGet(String(args.id)),
  },
  {
    name: "categories_list",
    description: "List patient categories.",
    permission: "categories.read",
    inputSchema: { type: "object", properties: {} },
    run: () => crm.categoriesList(),
  },
  {
    name: "category_get",
    description: "Get a category by id.",
    permission: "categories.read",
    inputSchema: { type: "object", required: ["category_id"], properties: { category_id: { type: "string" } } },
    run: (_a, args) => crm.categoryGet(String(args.category_id)),
  },
  {
    name: "category_create",
    description: "Create a patient category.",
    permission: "categories.write",
    inputSchema: {
      type: "object",
      required: ["name_en", "name_ar"],
      properties: {
        slug: { type: "string" },
        name_en: { type: "string" },
        name_ar: { type: "string" },
        color: { type: "string" },
        sort_order: { type: "number" },
        status: { type: "string" },
      },
    },
    run: (actor, args) => crm.categoryCreate(actor, args),
  },
  {
    name: "category_update",
    description: "Update a patient category.",
    permission: "categories.write",
    inputSchema: {
      type: "object",
      required: ["category_id"],
      properties: {
        category_id: { type: "string" },
        slug: { type: "string" },
        name_en: { type: "string" },
        name_ar: { type: "string" },
        color: { type: "string" },
        sort_order: { type: "number" },
        status: { type: "string" },
      },
    },
    run: (actor, args) => {
      const { category_id, ...patch } = args;
      return crm.categoryUpdate(actor, String(category_id), patch);
    },
  },
  {
    name: "patient_category_set",
    description: "Set a patient's primary category.",
    permission: "categories.write",
    inputSchema: { type: "object", required: ["patient_id", "category_id"], properties: { patient_id: { type: "string" }, category_id: { type: "string" } } },
    run: (actor, args) => crm.patientCategorySet(actor, String(args.patient_id), String(args.category_id)),
  },
];

export function createCrmMcpServer(actor: McpActor) {
  const server = new Server(
    { name: "nahdha-crm", version: "1.1.0" },
    { capabilities: { tools: {} }, instructions: MAZEN_INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools
      .filter((tool) => actorHasPermission(actor, tool.permission))
      .map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const def = tools.find((tool) => tool.name === request.params.name);
    if (!def) {
      await logMcp(actor, request.params.name, false, { error: "Unknown tool" });
      return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
    }
    try {
      gatePermission(actor, def.permission);
      const result = await def.run(actor, (request.params.arguments ?? {}) as Record<string, unknown>);
      const record = result as { id?: string; patient?: { id?: string } } | null;
      await logMcp(actor, def.name, true, { action: def.name, entityId: record?.id ?? record?.patient?.id, entityType: def.name.split("_")[0] });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "Tool failed";
      await logMcp(actor, def.name, false, { error: message });
      return { content: [{ type: "text", text: message }], isError: true };
    }
  });

  return server;
}

export { authenticateToken };
