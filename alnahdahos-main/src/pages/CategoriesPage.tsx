import { useEffect, useState } from "react";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { Table } from "@heroui/react/table";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { canWrite } from "../lib/permissions";
import type { Category } from "../lib/types";

export function CategoriesPage() {
  const { t, categoryName } = useI18n();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role, "categories");
  const [rows, setRows] = useState<(Category & { count: number })[]>([]);

  async function load() {
    const { data: cats } = await supabase.from("categories").select("*").order("sort_order");
    const { data: patients } = await supabase.from("patients").select("category_id").is("archived_at", null);
    const counts = new Map<string, number>();
    for (const p of patients ?? []) {
      const id = (p as { category_id: string | null }).category_id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    setRows(((cats as Category[]) ?? []).map((c) => ({ ...c, count: counts.get(c.id) ?? 0 })));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("categories")}</h1>
        {writable ? <CategoryForm onSaved={() => void load()} /> : null}
      </div>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t("categories")}>
            <Table.Header>
              <Table.Column isRowHeader>{t("name")}</Table.Column>
              <Table.Column>{t("patientsCount")}</Table.Column>
              <Table.Column>{t("status")}</Table.Column>
              <Table.Column>{t("actions")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>{categoryName(row.name_en, row.name_ar)}</Table.Cell>
                  <Table.Cell>{row.count}</Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" color={row.status === "active" ? "success" : "warning"}>
                      {row.status === "archived" ? t("archived") : t("active")}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    {writable ? (
                      <div className="flex gap-2">
                        <CategoryForm category={row} onSaved={() => void load()} />
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={async () => {
                            const { error } = await supabase.from("categories").update({ status: "archived" }).eq("id", row.id);
                            if (error) toast.danger(error.message);
                            else void load();
                          }}
                        >
                          {t("archive")}
                        </Button>
                      </div>
                    ) : null}
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

function CategoryForm({ category, onSaved }: { category?: Category; onSaved: () => void }) {
  const { t } = useI18n();
  return (
    <Modal>
      <Button size={category ? "sm" : "md"} variant={category ? "ghost" : undefined}>
        {category ? t("edit") : t("add")}
      </Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const name_en = String(fd.get("name_en") || "");
                const payload = {
                  name_en,
                  name_ar: String(fd.get("name_ar") || ""),
                  slug: category?.slug ?? name_en.toLowerCase().replace(/\s+/g, "-"),
                };
                const q = category
                  ? supabase.from("categories").update(payload).eq("id", category.id)
                  : supabase.from("categories").insert(payload);
                const { error } = await q;
                if (error) return toast.danger(error.message);
                toast.success(t("saved"));
                onSaved();
              }}
            >
              <Modal.Header><Modal.Heading>{t("categories")}</Modal.Heading></Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <TextField isRequired name="name_en" defaultValue={category?.name_en}><Label>{t("orgNameEn")}</Label><Input /></TextField>
                <TextField isRequired name="name_ar" defaultValue={category?.name_ar}><Label>{t("orgNameAr")}</Label><Input /></TextField>
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
