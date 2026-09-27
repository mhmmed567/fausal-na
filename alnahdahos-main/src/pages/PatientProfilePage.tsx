import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { Select } from "@heroui/react/select";
import { Spinner } from "@heroui/react/spinner";
import { Table } from "@heroui/react/table";
import { Tabs } from "@heroui/react/tabs";
import { TextArea } from "@heroui/react/textarea";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { canWrite } from "../lib/permissions";
import { formatDate, formatDateTime } from "../lib/format";
import { PatientFormModal } from "../components/patients/PatientFormModal";
import type { Condition, Medication, Note, Patient, PatientCondition, PatientMedication, Message, ActivityLog } from "../lib/types";

export function PatientProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale, categoryName } = useI18n();
  const { profile } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [meds, setMeds] = useState<PatientMedication[]>([]);
  const [conds, setConds] = useState<PatientCondition[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [catalogMeds, setCatalogMeds] = useState<Medication[]>([]);
  const [catalogConds, setCatalogConds] = useState<Condition[]>([]);
  const [loading, setLoading] = useState(true);

  const canPatients = canWrite(profile?.role, "patients");
  const canMeds = canWrite(profile?.role, "medications");
  const canConds = canWrite(profile?.role, "conditions");
  const canNotes = canWrite(profile?.role, "notes");

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: p }, { data: pm }, { data: pc }, { data: n }, { data: m }, { data: a }] = await Promise.all([
      supabase.from("patients").select("*, categories(*)").eq("id", id).maybeSingle(),
      supabase.from("patient_medications").select("*, medications(*)").eq("patient_id", id).order("created_at", { ascending: false }),
      supabase.from("patient_conditions").select("*, conditions(*), profiles(full_name)").eq("patient_id", id).order("created_at", { ascending: false }),
      supabase.from("notes").select("*, profiles(full_name)").eq("patient_id", id).order("created_at", { ascending: false }),
      supabase.from("messages").select("*").eq("patient_id", id).order("received_at", { ascending: false }),
      supabase.from("activity_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
    ]);
    setPatient(p as Patient);
    setMeds((pm as PatientMedication[]) ?? []);
    setConds((pc as PatientCondition[]) ?? []);
    setNotes((n as Note[]) ?? []);
    setMessages((m as Message[]) ?? []);
    setActivity((a as ActivityLog[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
    void supabase.from("medications").select("*").eq("status", "active").then(({ data }) => setCatalogMeds((data as Medication[]) ?? []));
    void supabase.from("conditions").select("*").eq("status", "active").then(({ data }) => setCatalogConds((data as Condition[]) ?? []));
  }, [load]);

  if (loading) return <Spinner />;
  if (!patient) return <p>{t("noResults")}</p>;

  const cat = (patient as unknown as { categories?: { name_en: string; name_ar: string } }).categories;

  async function archive() {
    const { error } = await supabase.from("patients").update({ archived_at: new Date().toISOString() }).eq("id", patient!.id);
    if (error) return toast.danger(error.message);
    await supabase.rpc("log_activity", {
      p_actor_type: "user",
      p_actor_id: profile?.id,
      p_action: "record.archived",
      p_entity_type: "patient",
      p_entity_id: patient!.id,
      p_metadata: {},
    });
    toast.success(t("archivedOk"));
    navigate("/patients");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{patient.full_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{patient.primary_phone}</span>
            <Chip size="sm" color={patient.status === "active" ? "success" : "default"}>
              {t(patient.status)}
            </Chip>
            <Chip size="sm" variant="soft">
              {cat ? categoryName(cat.name_en, cat.name_ar) : t("uncategorized")}
            </Chip>
            <span>
              {t("lastContact")}: {formatDateTime(patient.last_contact_at, locale)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPatients ? (
            <PatientFormModal patient={patient} onSaved={() => void load()} trigger={<Button variant="secondary">{t("edit")}</Button>} />
          ) : null}
          {canNotes ? <AddNoteModal patientId={patient.id} onSaved={() => void load()} /> : null}
          {canMeds ? <AddMedicationModal patientId={patient.id} medications={catalogMeds} onSaved={() => void load()} /> : null}
          {canConds ? <AddConditionModal patientId={patient.id} conditions={catalogConds} onSaved={() => void load()} /> : null}
          {canPatients ? (
            <Button variant="danger-soft" onPress={() => void archive()}>
              {t("archive")}
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultSelectedKey="overview">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Patient">
            {["overview", "medications", "conditions", "messages", "notes", "activity"].map((tab) => (
              <Tabs.Tab key={tab} id={tab}>
                {t(tab as "overview")}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="overview" className="grid gap-4 pt-5 md:grid-cols-2">
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold">{t("contactInfo")}</h2>
            <dl className="space-y-2 text-sm">
              <Row label={t("name")} value={patient.full_name} />
              <Row label={t("phone")} value={patient.primary_phone} />
              <Row label={t("secondaryPhone")} value={patient.secondary_phone} />
              <Row label={t("email")} value={patient.email} />
              <Row label={t("civilId")} value={patient.civil_id} />
              <Row label={t("fileNumber")} value={patient.file_number} />
              <Row label={t("communicationConsent")} value={t(patient.communication_consent ?? "unknown")} />
              <Row label={t("phoneStatus")} value={t(patient.phone_status ?? "unknown")} />
            </dl>
          </section>
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold">{t("patientInfo")}</h2>
            <dl className="space-y-2 text-sm">
              <Row label={t("patientId")} value={patient.id.slice(0, 8)} />
              <Row label={t("category")} value={cat ? categoryName(cat.name_en, cat.name_ar) : t("uncategorized")} />
              <Row label={t("status")} value={t(patient.status)} />
              <Row label={t("createdAt")} value={formatDateTime(patient.created_at, locale)} />
              <Row label={t("lastContact")} value={formatDateTime(patient.last_contact_at, locale)} />
            </dl>
          </section>
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold">{t("quickNotes")}</h2>
            <ul className="space-y-2 text-sm">
              {notes.slice(0, 3).map((n) => (
                <li key={n.id} className="text-muted">
                  {n.body}
                </li>
              ))}
              {notes.length === 0 ? <li className="text-muted">{t("noResults")}</li> : null}
            </ul>
          </section>
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold">{t("currentMedications")}</h2>
            <ul className="space-y-2 text-sm">
              {meds
                .filter((m) => m.status === "active")
                .slice(0, 4)
                .map((m) => (
                  <li key={m.id}>
                    {m.medications?.name} {m.dosage ? `· ${m.dosage}` : ""}
                  </li>
                ))}
              {meds.length === 0 ? <li className="text-muted">{t("noResults")}</li> : null}
            </ul>
          </section>
        </Tabs.Panel>

        <Tabs.Panel id="medications" className="pt-5">
          <MedsTable rows={meds} locale={locale} canWrite={canMeds} onChanged={load} />
        </Tabs.Panel>
        <Tabs.Panel id="conditions" className="pt-5">
          <CondsTable rows={conds} locale={locale} categoryName={categoryName} />
        </Tabs.Panel>
        <Tabs.Panel id="messages" className="pt-5">
          <MessagesTable rows={messages} locale={locale} />
        </Tabs.Panel>
        <Tabs.Panel id="notes" className="pt-5 space-y-3">
          {notes.map((n) => (
            <article key={n.id} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              <p className="mt-2 text-xs text-muted">
                {n.profiles?.full_name ?? "—"} · {formatDateTime(n.created_at, locale)}
              </p>
            </article>
          ))}
          {notes.length === 0 ? <p className="text-muted">{t("noResults")}</p> : null}
        </Tabs.Panel>
        <Tabs.Panel id="activity" className="pt-5">
          <ul className="space-y-2">
            {activity.map((a) => (
              <li key={a.id} className="flex justify-between rounded-lg border border-border px-4 py-2 text-sm">
                <span>{a.action}</span>
                <span className="text-muted">{formatDateTime(a.created_at, locale)}</span>
              </li>
            ))}
          </ul>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function MedsTable({
  rows,
  locale,
  canWrite,
  onChanged,
}: {
  rows: PatientMedication[];
  locale: string;
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { profile } = useAuth();
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={t("medications")} className="min-w-[800px]">
          <Table.Header>
            <Table.Column isRowHeader>{t("medication")}</Table.Column>
            <Table.Column>{t("genericName")}</Table.Column>
            <Table.Column>{t("dosage")}</Table.Column>
            <Table.Column>{t("frequency")}</Table.Column>
            <Table.Column>{t("status")}</Table.Column>
            <Table.Column>{t("startDate")}</Table.Column>
            <Table.Column>{t("endDate")}</Table.Column>
            <Table.Column>{t("notes")}</Table.Column>
            <Table.Column>{t("actions")}</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>{row.medications?.name}</Table.Cell>
                <Table.Cell>{row.medications?.generic_name ?? "—"}</Table.Cell>
                <Table.Cell>{row.dosage ?? "—"}</Table.Cell>
                <Table.Cell>{row.frequency ?? "—"}</Table.Cell>
                <Table.Cell>
                  <Chip size="sm" color={row.status === "active" ? "success" : "warning"}>
                    {row.status === "active" ? t("active") : t("discontinued")}
                  </Chip>
                </Table.Cell>
                <Table.Cell>{formatDate(row.start_date, locale)}</Table.Cell>
                <Table.Cell>{formatDate(row.end_date, locale)}</Table.Cell>
                <Table.Cell>{row.notes ?? "—"}</Table.Cell>
                <Table.Cell>
                  {canWrite && row.status === "active" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={async () => {
                        const { error } = await supabase
                          .from("patient_medications")
                          .update({ status: "discontinued", end_date: new Date().toISOString().slice(0, 10) })
                          .eq("id", row.id);
                        if (error) return toast.danger(error.message);
                        await supabase.rpc("log_activity", {
                          p_actor_type: "user",
                          p_actor_id: profile?.id,
                          p_action: "medication.removed",
                          p_entity_type: "patient_medication",
                          p_entity_id: row.id,
                          p_metadata: { patient_id: row.patient_id },
                        });
                        toast.success(t("saved"));
                        await onChanged();
                      }}
                    >
                      {t("remove")}
                    </Button>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function CondsTable({
  rows,
  locale,
  categoryName,
}: {
  rows: PatientCondition[];
  locale: string;
  categoryName: (en?: string | null, ar?: string | null) => string;
}) {
  const { t } = useI18n();
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={t("conditions")}>
          <Table.Header>
            <Table.Column isRowHeader>{t("condition")}</Table.Column>
            <Table.Column>{t("status")}</Table.Column>
            <Table.Column>{t("notes")}</Table.Column>
            <Table.Column>{t("addedBy")}</Table.Column>
            <Table.Column>{t("addedAt")}</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>{categoryName(row.conditions?.name_en, row.conditions?.name_ar)}</Table.Cell>
                <Table.Cell>{row.status === "active" ? t("active") : t("resolved")}</Table.Cell>
                <Table.Cell>{row.notes ?? "—"}</Table.Cell>
                <Table.Cell>{row.profiles?.full_name ?? "—"}</Table.Cell>
                <Table.Cell>{formatDateTime(row.created_at, locale)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function MessagesTable({ rows, locale }: { rows: Message[]; locale: string }) {
  const { t } = useI18n();
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={t("messages")}>
          <Table.Header>
            <Table.Column isRowHeader>{t("direction")}</Table.Column>
            <Table.Column>{t("messagePreview")}</Table.Column>
            <Table.Column>{t("date")}</Table.Column>
            <Table.Column>{t("status")}</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>{t(row.direction)}</Table.Cell>
                <Table.Cell className="max-w-md truncate">{row.message_body}</Table.Cell>
                <Table.Cell>{formatDateTime(row.received_at, locale)}</Table.Cell>
                <Table.Cell>{t(row.status as "new")}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function AddNoteModal({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  return (
    <Modal>
      <Button variant="secondary">{t("addNote")}</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t("addNote")}</Modal.Heading>
            </Modal.Header>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const body = String(new FormData(e.currentTarget).get("body") || "").trim();
                if (!body) return;
                const { error } = await supabase.from("notes").insert({ patient_id: patientId, body, created_by: profile?.id });
                if (error) return toast.danger(error.message);
                await supabase.rpc("log_activity", {
                  p_actor_type: "user",
                  p_actor_id: profile?.id,
                  p_action: "note.added",
                  p_entity_type: "patient",
                  p_entity_id: patientId,
                  p_metadata: {},
                });
                toast.success(t("saved"));
                onSaved();
              }}
            >
              <Modal.Body>
                <TextField isRequired name="body">
                  <Label>{t("notes")}</Label>
                  <TextArea className="min-h-28 w-full" />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  {t("cancel")}
                </Button>
                <Button type="submit">{t("save")}</Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function AddMedicationModal({
  patientId,
  medications,
  onSaved,
}: {
  patientId: string;
  medications: Medication[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [medicationId, setMedicationId] = useState<string | null>(null);
  return (
    <Modal>
      <Button variant="secondary">{t("addMedication")}</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t("addMedication")}</Modal.Heading>
            </Modal.Header>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                if (!medicationId) return;
                const { error } = await supabase.from("patient_medications").insert({
                  patient_id: patientId,
                  medication_id: medicationId,
                  dosage: String(fd.get("dosage") || "") || null,
                  frequency: String(fd.get("frequency") || "") || null,
                  start_date: String(fd.get("start_date") || "") || null,
                  notes: String(fd.get("notes") || "") || null,
                  created_by: profile?.id,
                });
                if (error) return toast.danger(error.message);
                await supabase.rpc("log_activity", {
                  p_actor_type: "user",
                  p_actor_id: profile?.id,
                  p_action: "medication.added",
                  p_entity_type: "patient",
                  p_entity_id: patientId,
                  p_metadata: { medication_id: medicationId },
                });
                toast.success(t("saved"));
                setMedicationId(null);
                onSaved();
              }}
            >
              <Modal.Body className="flex flex-col gap-3">
                <Select selectedKey={medicationId} onSelectionChange={(key) => setMedicationId(key ? String(key) : null)} placeholder={t("medication")}>
                  <Label>{t("medication")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {medications.map((m) => (
                        <ListBox.Item key={m.id} id={m.id} textValue={m.name}>
                          {m.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <TextField name="dosage">
                  <Label>{t("dosage")}</Label>
                  <Input placeholder="5 mg" />
                </TextField>
                <TextField name="frequency">
                  <Label>{t("frequency")}</Label>
                  <Input placeholder="Once daily" />
                </TextField>
                <TextField name="start_date" type="date">
                  <Label>{t("startDate")}</Label>
                  <Input />
                </TextField>
                <TextField name="notes">
                  <Label>{t("notes")}</Label>
                  <Input />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  {t("cancel")}
                </Button>
                <Button type="submit">{t("save")}</Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function AddConditionModal({
  patientId,
  conditions,
  onSaved,
}: {
  patientId: string;
  conditions: Condition[];
  onSaved: () => void;
}) {
  const { t, categoryName } = useI18n();
  const { profile } = useAuth();
  const [conditionId, setConditionId] = useState<string | null>(null);
  return (
    <Modal>
      <Button variant="secondary">{t("addCondition")}</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t("addCondition")}</Modal.Heading>
            </Modal.Header>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                if (!conditionId) return;
                const { error } = await supabase.from("patient_conditions").insert({
                  patient_id: patientId,
                  condition_id: conditionId,
                  notes: String(fd.get("notes") || "") || "Added manually",
                  created_by: profile?.id,
                });
                if (error) return toast.danger(error.message);
                await supabase.rpc("log_activity", {
                  p_actor_type: "user",
                  p_actor_id: profile?.id,
                  p_action: "condition.added",
                  p_entity_type: "patient",
                  p_entity_id: patientId,
                  p_metadata: { condition_id: conditionId },
                });
                toast.success(t("saved"));
                setConditionId(null);
                onSaved();
              }}
            >
              <Modal.Body className="flex flex-col gap-3">
                <Select selectedKey={conditionId} onSelectionChange={(key) => setConditionId(key ? String(key) : null)} placeholder={t("condition")}>
                  <Label>{t("condition")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {conditions.map((c) => (
                        <ListBox.Item key={c.id} id={c.id} textValue={categoryName(c.name_en, c.name_ar)}>
                          {categoryName(c.name_en, c.name_ar)}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <TextField name="notes">
                  <Label>{t("notes")}</Label>
                  <Input />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  {t("cancel")}
                </Button>
                <Button type="submit">{t("save")}</Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
