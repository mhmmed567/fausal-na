import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Dropdown } from "@heroui/react/dropdown";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Spinner } from "@heroui/react/spinner";
import { Table } from "@heroui/react/table";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { canWrite } from "../lib/permissions";
import { formatDateTime } from "../lib/format";
import type { Medication } from "../lib/types";

export function MedicationsPage() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<(Medication & { patients_count: number })[]>([]);
  const writable = canWrite(profile?.role, "medications");

  async function load() {
    const { data: meds } = await supabase.from("medications").select("*").order("name");
    const { data: links } = await supabase.from("patient_medications").select("medication_id").eq("status", "active");
    const counts = new Map<string, number>();
    for (const row of links ?? []) {
      const id = (row as { medication_id: string }).medication_id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    setRows(((meds as Medication[]) ?? []).map((m) => ({ ...m, patients_count: counts.get(m.id) ?? 0 })));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("medications")}</h1>
        {writable ? <MedicationForm onSaved={() => void load()} /> : null}
      </div>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t("medications")} className="min-w-[800px]">
            <Table.Header>
              <Table.Column isRowHeader>{t("name")}</Table.Column>
              <Table.Column>{t("genericName")}</Table.Column>
              <Table.Column>{t("category")}</Table.Column>
              <Table.Column>{t("patientsCount")}</Table.Column>
              <Table.Column>{t("status")}</Table.Column>
              <Table.Column>{t("updatedAt")}</Table.Column>
              <Table.Column>{t("actions")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>
                    <Link className="font-medium hover:underline" to={`/medications/${row.id}`}>
                      {row.name}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{row.generic_name ?? "—"}</Table.Cell>
                  <Table.Cell>{row.category ?? "—"}</Table.Cell>
                  <Table.Cell>{row.patients_count}</Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" color={row.status === "active" ? "success" : "default"}>
                      {t(row.status === "active" ? "active" : "inactive")}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>{formatDateTime(row.updated_at, locale)}</Table.Cell>
                  <Table.Cell>
                    <Dropdown>
                      <Button size="sm" variant="ghost">{t("actions")}</Button>
                      <Dropdown.Popover>
                        <Dropdown.Menu
                          onAction={(key) => {
                            if (key === "view") navigate(`/medications/${row.id}`);
                            if (key === "deactivate" && writable) {
                              void supabase.from("medications").update({ status: "inactive" }).eq("id", row.id).then(() => void load());
                            }
                          }}
                        >
                          <Dropdown.Item id="view" textValue={t("view")}><Label>{t("view")}</Label></Dropdown.Item>
                          {writable ? <Dropdown.Item id="deactivate" textValue={t("deactivate")}><Label>{t("deactivate")}</Label></Dropdown.Item> : null}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

function MedicationForm({ medication, onSaved }: { medication?: Medication; onSaved: () => void }) {
  const { t } = useI18n();
  return (
    <Modal>
      <Button>{medication ? t("edit") : t("add")}</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const payload = {
                  name: String(fd.get("name") || ""),
                  generic_name: String(fd.get("generic_name") || "") || null,
                  category: String(fd.get("category") || "") || null,
                  notes: String(fd.get("notes") || "") || null,
                };
                const q = medication
                  ? supabase.from("medications").update(payload).eq("id", medication.id)
                  : supabase.from("medications").insert(payload);
                const { error } = await q;
                if (error) return toast.danger(error.message);
                toast.success(t("saved"));
                onSaved();
              }}
            >
              <Modal.Header><Modal.Heading>{t("medications")}</Modal.Heading></Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <TextField isRequired name="name" defaultValue={medication?.name}><Label>{t("name")}</Label><Input /></TextField>
                <TextField name="generic_name" defaultValue={medication?.generic_name ?? ""}><Label>{t("genericName")}</Label><Input /></TextField>
                <TextField name="category" defaultValue={medication?.category ?? ""}><Label>{t("category")}</Label><Input /></TextField>
                <TextField name="notes" defaultValue={medication?.notes ?? ""}><Label>{t("notes")}</Label><Input /></TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">{t("cancel")}</Button>
                <Button type="submit">{t("save")}</Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function MedicationDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role, "medications");
  const [med, setMed] = useState<Medication | null>(null);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    void supabase.from("medications").select("*").eq("id", id).maybeSingle().then(({ data }) => setMed(data as Medication));
    void supabase
      .from("patient_medications")
      .select("patients(id, full_name)")
      .eq("medication_id", id)
      .eq("status", "active")
      .then(({ data }) => {
        setPatients(
          (data ?? [])
            .map((row) => (row as unknown as { patients: { id: string; full_name: string } | null }).patients)
            .filter(Boolean) as { id: string; full_name: string }[],
        );
      });
  }, [id]);

  if (!med) return <Spinner />;
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{med.name}</h1>
          <p className="text-muted">{med.generic_name} {med.category ? `· ${med.category}` : ""}</p>
          {med.notes ? <p className="mt-2 text-sm">{med.notes}</p> : null}
        </div>
        {writable ? <MedicationForm medication={med} onSaved={() => window.location.reload()} /> : null}
      </div>
      <section>
        <h2 className="mb-3 font-semibold">{t("patientsUsing")}</h2>
        <ul className="space-y-2">
          {patients.map((p) => (
            <li key={p.id}>
              <Link className="hover:underline" to={`/patients/${p.id}`}>{p.full_name}</Link>
            </li>
          ))}
          {patients.length === 0 ? <li className="text-muted">{t("noResults")}</li> : null}
        </ul>
      </section>
    </div>
  );
}
