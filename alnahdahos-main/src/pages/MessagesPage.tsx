import { NotificationCampaigns } from "../components/NotificationCampaigns";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { Select } from "@heroui/react/select";
import { Table } from "@heroui/react/table";
import { TextArea } from "@heroui/react/textarea";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { canWrite } from "../lib/permissions";
import { formatDateTime } from "../lib/format";
import { PatientFormModal } from "../components/patients/PatientFormModal";
import { EmptyState } from "../components/EmptyState";
import type { Message, Patient } from "../lib/types";

export function MessagesPage() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Message[]>([]);
  const [open, setOpen] = useState<Message | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const writable = canWrite(profile?.role, "messages");

  async function load() {
    const { data } = await supabase
      .from("messages")
      .select("*, patients(id, full_name)")
      .order("received_at", { ascending: false })
      .limit(100);
    setRows((data as Message[]) ?? []);
  }

  useEffect(() => {
    void load();
    void supabase.from("patients").select("id, full_name, primary_phone").is("archived_at", null).then(({ data }) => setPatients((data as Patient[]) ?? []));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("messages")}</h1>
        {writable ? <CreateMessageModal patients={patients} onSaved={() => void load()} /> : null}
      </div>
      <NotificationCampaigns />
      {rows.length === 0 ? (
        <EmptyState title={t("emptyMessages")} hint={t("emptyMessagesHint")} />
      ) : (
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t("messages")} className="min-w-[800px]">
            <Table.Header>
              <Table.Column isRowHeader>{t("patients")}</Table.Column>
              <Table.Column>{t("phone")}</Table.Column>
              <Table.Column>{t("messagePreview")}</Table.Column>
              <Table.Column>{t("direction")}</Table.Column>
              <Table.Column>{t("date")}</Table.Column>
              <Table.Column>{t("status")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>
                    <button className="text-start font-medium hover:underline" onClick={() => setOpen(row)}>
                      {row.patients?.full_name ?? t("unlinked")}
                    </button>
                  </Table.Cell>
                  <Table.Cell>{row.phone_number}</Table.Cell>
                  <Table.Cell className="max-w-xs truncate">{row.message_body}</Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" variant="soft">
                      {t(row.direction)}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>{formatDateTime(row.received_at, locale)}</Table.Cell>
                  <Table.Cell>{t(row.status as "new")}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      )}

      <Modal isOpen={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-lg">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{t("messages")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{open?.message_body}</p>
                <p className="text-muted">
                  {open?.phone_number} · {open ? t(open.direction) : ""} · {open ? formatDateTime(open.received_at, locale) : ""}
                </p>
                {open?.patients ? (
                  <Link className="text-accent hover:underline" to={`/patients/${open.patients.id}`}>
                    {open.patients.full_name}
                  </Link>
                ) : writable ? (
                  <div className="flex gap-2">
                    <PatientFormModal
                      onSaved={async (id) => {
                        await supabase.from("messages").update({ patient_id: id }).eq("id", open!.id);
                        await supabase.rpc("log_activity", {
                          p_actor_type: "user",
                          p_actor_id: profile?.id,
                          p_action: "message.linked",
                          p_entity_type: "message",
                          p_entity_id: open!.id,
                          p_metadata: { patient_id: id },
                        });
                        setOpen(null);
                        void load();
                      }}
                      trigger={<Button size="sm">{t("createPatient")}</Button>}
                    />
                    <LinkPatientModal
                      message={open!}
                      patients={patients}
                      onLinked={() => {
                        setOpen(null);
                        void load();
                      }}
                    />
                  </div>
                ) : (
                  <Chip>{t("unlinked")}</Chip>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}

function LinkPatientModal({
  message,
  patients,
  onLinked,
}: {
  message: Message;
  patients: Patient[];
  onLinked: () => void;
}) {
  const { t } = useI18n();
  const { profile } = useAuth();
  return (
    <Modal>
      <Button size="sm" variant="secondary">
        {t("linkPatient")}
      </Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const patient_id = String(new FormData(e.currentTarget).get("patient_id") || "");
                if (!patient_id) return;
                const { error } = await supabase.from("messages").update({ patient_id }).eq("id", message.id);
                if (error) return toast.danger(error.message);
                await supabase.rpc("log_activity", {
                  p_actor_type: "user",
                  p_actor_id: profile?.id,
                  p_action: "message.linked",
                  p_entity_type: "message",
                  p_entity_id: message.id,
                  p_metadata: { patient_id },
                });
                toast.success(t("saved"));
                onLinked();
              }}
            >
              <Modal.Header>
                <Modal.Heading>{t("linkPatient")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Select name="patient_id">
                  <Label>{t("patients")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {patients.map((p) => (
                        <ListBox.Item key={p.id} id={p.id} textValue={p.full_name}>
                          {p.full_name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
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

function CreateMessageModal({ patients, onSaved }: { patients: Patient[]; onSaved: () => void }) {
  const { t } = useI18n();
  return (
    <Modal>
      <Button>{t("add")}</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const { error } = await supabase.from("messages").insert({
                  phone_number: String(fd.get("phone_number") || ""),
                  direction: String(fd.get("direction") || "incoming"),
                  message_body: String(fd.get("message_body") || ""),
                  patient_id: String(fd.get("patient_id") || "") || null,
                  status: String(fd.get("direction")) === "outgoing" ? "sent" : "new",
                });
                if (error) return toast.danger(error.message);
                toast.success(t("saved"));
                onSaved();
              }}
            >
              <Modal.Header>
                <Modal.Heading>{t("messages")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <TextField isRequired name="phone_number">
                  <Label>{t("phone")}</Label>
                  <Input />
                </TextField>
                <Select name="direction" defaultSelectedKey="incoming">
                  <Label>{t("direction")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="incoming">{t("incoming")}<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="outgoing">{t("outgoing")}<ListBox.ItemIndicator /></ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
                <Select name="patient_id">
                  <Label>{t("patients")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {patients.map((p) => (
                        <ListBox.Item key={p.id} id={p.id} textValue={p.full_name}>
                          {p.full_name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <TextField isRequired name="message_body">
                  <Label>{t("messages")}</Label>
                  <TextArea className="min-h-24 w-full" />
                </TextField>
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
