import { Button } from "@heroui/react/button";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { Select } from "@heroui/react/select";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";
import type { Category, Patient, PatientListRow } from "../../lib/types";

type Props = {
  patient?: Patient | PatientListRow | null;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: (id: string) => void;
  trigger?: ReactNode;
};

export function PatientFormModal({ patient, onSaved, trigger, isOpen, onOpenChange }: Props) {
  const { t, categoryName } = useI18n();
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(patient?.category_id ?? null);
  const [status, setStatus] = useState<string>(patient?.status ?? "active");

  useEffect(() => {
    void supabase
      .from("categories")
      .select("*")
      .eq("status", "active")
      .order("sort_order")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);

  useEffect(() => {
    setCategoryId(patient?.category_id ?? null);
    setStatus(patient?.status ?? "active");
  }, [patient?.id, patient?.category_id, patient?.status]);

  return (
    <Modal>
      {trigger}
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{patient ? t("edit") : t("addPatient")}</Modal.Heading>
            </Modal.Header>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const payload = {
                  full_name: String(fd.get("full_name") || "").trim(),
                  primary_phone: String(fd.get("primary_phone") || "").trim(),
                  secondary_phone: String(fd.get("secondary_phone") || "").trim() || null,
                  email: String(fd.get("email") || "").trim() || null,
                  status: (status as "active" | "inactive") || "active",
                  category_id: categoryId,
                  civil_id: String(fd.get("civil_id") || "").trim() || null,
                  file_number: String(fd.get("file_number") || "").trim() || null,
                  communication_consent: String(fd.get("communication_consent") || "unknown"),
                  phone_status: String(fd.get("phone_status") || "unknown"),
                };
                if (!payload.full_name || !payload.primary_phone) return;
                if (patient) {
                  const { error } = await supabase.from("patients").update(payload).eq("id", patient.id);
                  if (error) return toast.danger(error.message);
                  await supabase.rpc("log_activity", {
                    p_actor_type: "user",
                    p_actor_id: profile?.id,
                    p_action: "patient.updated",
                    p_entity_type: "patient",
                    p_entity_id: patient.id,
                    p_metadata: {},
                  });
                  toast.success(t("saved"));
                  onSaved(patient.id);
                } else {
                  const { data, error } = await supabase.from("patients").insert({ ...payload, created_by: profile?.id }).select("id").single();
                  if (error || !data) return toast.danger(error?.message ?? "Error");
                  await supabase.rpc("link_patient_messages", { p_patient_id: data.id });
                  await supabase.rpc("log_activity", {
                    p_actor_type: "user",
                    p_actor_id: profile?.id,
                    p_action: "patient.created",
                    p_entity_type: "patient",
                    p_entity_id: data.id,
                    p_metadata: {},
                  });
                  toast.success(t("saved"));
                  onSaved(data.id);
                }
              }}
            >
              <Modal.Body className="flex flex-col gap-3">
                <TextField isRequired name="full_name" defaultValue={patient?.full_name ?? ""}>
                  <Label>{t("name")}</Label>
                  <Input />
                </TextField>
                <TextField isRequired name="primary_phone" defaultValue={patient?.primary_phone ?? ""}>
                  <Label>{t("phone")}</Label>
                  <Input placeholder="+968" />
                </TextField>
                <TextField name="secondary_phone" defaultValue={patient?.secondary_phone ?? ""}>
                  <Label>{t("secondaryPhone")}</Label>
                  <Input />
                </TextField>
                <TextField name="email" type="email" defaultValue={patient?.email ?? ""}>
                  <Label>{t("email")}</Label>
                  <Input />
                </TextField>
                <TextField name="civil_id" defaultValue={patient?.civil_id ?? ""}><Label>{t("civilId")}</Label><Input /></TextField>
                <TextField name="file_number" defaultValue={patient?.file_number ?? ""}><Label>{t("fileNumber")}</Label><Input /></TextField>
                <label className="flex flex-col gap-1">{t("communicationConsent")}<select name="communication_consent" defaultValue={patient?.communication_consent ?? "unknown"} className="rounded-lg border border-border bg-surface p-2">{(["unknown","granted","denied"] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
                <label className="flex flex-col gap-1">{t("phoneStatus")}<select name="phone_status" defaultValue={patient?.phone_status ?? "unknown"} className="rounded-lg border border-border bg-surface p-2">{(["unknown","valid","invalid","unreachable"] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
                <Select selectedKey={categoryId} onSelectionChange={(key) => setCategoryId(key ? String(key) : null)} placeholder={t("category")}>
                  <Label>{t("category")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {categories.map((c) => (
                        <ListBox.Item key={c.id} id={c.id} textValue={categoryName(c.name_en, c.name_ar)}>
                          {categoryName(c.name_en, c.name_ar)}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <Select selectedKey={status} onSelectionChange={(key) => setStatus(key ? String(key) : "active")}>
                  <Label>{t("status")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="active" textValue={t("active")}>
                        {t("active")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="inactive" textValue={t("inactive")}>
                        {t("inactive")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
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
