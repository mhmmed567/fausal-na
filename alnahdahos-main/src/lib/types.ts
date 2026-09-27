export type AppRole = "admin" | "doctor" | "staff" | "viewer";
export type PatientStatus = "active" | "inactive";
export type CatalogStatus = "active" | "inactive" | "archived";
export type MedicationLinkStatus = "active" | "discontinued";
export type ConditionLinkStatus = "active" | "resolved";
export type MessageDirection = "incoming" | "outgoing";
export type MessageStatus = "new" | "read" | "sent" | "failed";
export type ActorType = "user" | "mcp" | "system";
export type McpClientStatus = "active" | "disabled";

export const MCP_PERMISSIONS = [
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

export type McpPermission = (typeof MCP_PERMISSIONS)[number];

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  color: string | null;
  status: CatalogStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Medication = {
  id: string;
  name: string;
  generic_name: string | null;
  category: string | null;
  status: CatalogStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patients_count?: number;
};

export type Condition = {
  id: string;
  name_en: string;
  name_ar: string;
  status: CatalogStatus;
};

export type Patient = {
  id: string;
  full_name: string;
  primary_phone: string;
  civil_id: string | null;
  file_number: string | null;
  communication_consent: "unknown" | "granted" | "denied";
  phone_status: "unknown" | "valid" | "invalid" | "unreachable";
  secondary_phone: string | null;
  email: string | null;
  status: PatientStatus;
  category_id: string | null;
  last_contact_at: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  category?: Category | null;
  medications_count?: number;
};

export type PatientListRow = {
  id: string;
  full_name: string;
  primary_phone: string;
  civil_id: string | null;
  file_number: string | null;
  communication_consent: "unknown" | "granted" | "denied";
  phone_status: "unknown" | "valid" | "invalid" | "unreachable";
  secondary_phone: string | null;
  email: string | null;
  status: PatientStatus;
  category_id: string | null;
  category_name_en: string | null;
  category_name_ar: string | null;
  medications_count: number;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PatientMedication = {
  id: string;
  patient_id: string;
  medication_id: string;
  dosage: string | null;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  status: MedicationLinkStatus;
  notes: string | null;
  created_at: string;
  medications?: Medication;
};

export type PatientCondition = {
  id: string;
  patient_id: string;
  condition_id: string;
  status: ConditionLinkStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  conditions?: Condition;
  profiles?: { full_name: string } | null;
};

export type Note = {
  id: string;
  patient_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string } | null;
};

export type Message = {
  id: string;
  patient_id: string | null;
  phone_number: string;
  direction: MessageDirection;
  message_body: string;
  status: MessageStatus;
  external_message_id: string | null;
  sent_at: string | null;
  failed_at: string | null;
  delivery_error: string | null;
  received_at: string;
  created_at: string;
  patients?: { id: string; full_name: string } | null;
};

export type ActivityLog = {
  id: string;
  actor_type: ActorType;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  profiles?: { full_name: string } | null;
};

export type McpClient = {
  id: string;
  name: string;
  status: McpClientStatus;
  permissions: string[];
  token_prefix: string | null;
  last_used_at: string | null;
  last_tool_call: string | null;
  created_at: string;
};

export type McpLog = {
  id: string;
  client_id: string | null;
  tool: string;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  success: boolean;
  error: string | null;
  created_at: string;
  mcp_clients?: { name: string } | null;
};

export type DashboardStats = {
  total_patients: number;
  new_patients_this_month: number;
  messages_today: number;
  active_patients: number;
  medications: number;
  categories: number;
};
