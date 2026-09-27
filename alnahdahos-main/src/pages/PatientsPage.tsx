import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Dropdown } from "@heroui/react/dropdown";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Pagination } from "@heroui/react/pagination";
import { SearchField } from "@heroui/react/search-field";
import { Select } from "@heroui/react/select";
import { Spinner } from "@heroui/react/spinner";
import { Table } from "@heroui/react/table";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { canWrite } from "../lib/permissions";
import { formatDateTime } from "../lib/format";
import type { Category, Medication, PatientListRow } from "../lib/types";
import { PatientFormModal } from "../components/patients/PatientFormModal";
import { EmptyState } from "../components/EmptyState";

const PAGE_SIZE = 12;

export function PatientsPage() {
  const { t, locale, categoryName } = useI18n();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [query, setQuery] = useState(q);
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [category, setCategory] = useState<string | null>(params.get("category"));
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [medication, setMedication] = useState<string | null>(params.get("medication"));
  const [includeArchived, setIncludeArchived] = useState(params.get("archived") === "1");
  const [lastContactFrom, setLastContactFrom] = useState(params.get("lc") ?? "");
  const [createdFrom, setCreatedFrom] = useState(params.get("created") ?? "");
  const [editing, setEditing] = useState<PatientListRow | null>(null);
  const [reload, setReload] = useState(0);
  const writable = canWrite(profile?.role, "patients");

  useEffect(() => {
    void supabase.from("categories").select("*").order("sort_order").then(({ data }) => setCategories((data as Category[]) ?? []));
    void supabase.from("medications").select("id, name").eq("status", "active").then(({ data }) => setMedications((data as Medication[]) ?? []));
  }, []);

  useEffect(() => {
    setQuery(q);
  }, [q]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_patients", {
        p_query: q || null,
        p_category: category,
        p_status: status,
        p_medication: medication,
        p_last_contact_from: lastContactFrom || null,
        p_created_from: createdFrom || null,
        p_include_archived: includeArchived,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) toast.danger(error.message);
      setRows((data as PatientListRow[]) ?? []);
      setLoading(false);
      setPage(1);
    }
    void load();
  }, [q, category, status, medication, includeArchived, lastContactFrom, createdFrom, reload]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  function applyQuery(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t("patients")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={query} onChange={setQuery} onSubmit={applyQuery} name="patients-search">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={t("searchPlaceholder")} className="w-64" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          {writable ? (
            <PatientFormModal
              onSaved={(id) => navigate(`/patients/${id}`)}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  {t("addPatient")}
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select selectedKey={category} onSelectionChange={(k) => setCategory(k ? String(k) : null)} placeholder={t("category")} className="w-48">
          <Label>{t("category")}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.ClearButton />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {categories.map((c) => (
                <ListBox.Item key={c.id} id={c.slug} textValue={categoryName(c.name_en, c.name_ar)}>
                  {categoryName(c.name_en, c.name_ar)}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select selectedKey={status} onSelectionChange={(k) => setStatus(k ? String(k) : null)} placeholder={t("status")} className="w-40">
          <Label>{t("status")}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.ClearButton />
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
        <Select selectedKey={medication} onSelectionChange={(k) => setMedication(k ? String(k) : null)} placeholder={t("medication")} className="w-48">
          <Label>{t("medication")}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.ClearButton />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {medications.map((m) => (
                <ListBox.Item key={m.id} id={m.name} textValue={m.name}>
                  {m.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <TextField value={lastContactFrom} onChange={setLastContactFrom} className="w-44">
          <Label>{t("lastContact")}</Label>
          <Input type="date" />
        </TextField>
        <TextField value={createdFrom} onChange={setCreatedFrom} className="w-44">
          <Label>{t("createdDate")}</Label>
          <Input type="date" />
        </TextField>
        <Button variant={includeArchived ? "secondary" : "ghost"} size="sm" onPress={() => setIncludeArchived((v) => !v)}>
          {t("includeArchived")}
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("emptyPatients")}
          hint={t("emptyPatientsHint")}
          action={
            writable ? (
              <PatientFormModal
                onSaved={(id) => navigate(`/patients/${id}`)}
                trigger={
                  <Button>
                    <Plus className="size-4" />
                    {t("addPatient")}
                  </Button>
                }
              />
            ) : null
          }
        />
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label={t("patients")} className="min-w-[900px]">
              <Table.Header>
                <Table.Column isRowHeader>{t("name")}</Table.Column>
                <Table.Column>{t("phone")}</Table.Column>
                <Table.Column>{t("category")}</Table.Column>
                <Table.Column>{t("medications")}</Table.Column>
                <Table.Column>{t("status")}</Table.Column>
                <Table.Column>{t("lastContact")}</Table.Column>
                <Table.Column>{t("updatedAt")}</Table.Column>
                <Table.Column>{t("actions")}</Table.Column>
              </Table.Header>
              <Table.Body>
                {pageRows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell>{t("noResults")}</Table.Cell>
                    <Table.Cell> </Table.Cell>
                    <Table.Cell> </Table.Cell>
                    <Table.Cell> </Table.Cell>
                    <Table.Cell> </Table.Cell>
                    <Table.Cell> </Table.Cell>
                    <Table.Cell> </Table.Cell>
                    <Table.Cell> </Table.Cell>
                  </Table.Row>
                ) : (
                  pageRows.map((row) => (
                    <Table.Row key={row.id}>
                      <Table.Cell>
                        <Link className="font-medium hover:underline" to={`/patients/${row.id}`}>
                          {row.full_name}
                        </Link>
                      </Table.Cell>
                      <Table.Cell>{row.primary_phone}</Table.Cell>
                      <Table.Cell>{categoryName(row.category_name_en, row.category_name_ar)}</Table.Cell>
                      <Table.Cell>
                        {row.medications_count} {t("medications").toLowerCase()}
                      </Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" color={row.archived_at ? "warning" : row.status === "active" ? "success" : "default"}>
                          {row.archived_at ? t("archived") : t(row.status)}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(row.last_contact_at, locale)}</Table.Cell>
                      <Table.Cell>{formatDateTime(row.updated_at, locale)}</Table.Cell>
                      <Table.Cell>
                        <Dropdown>
                          <Button size="sm" variant="ghost">
                            {t("actions")}
                          </Button>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === "view") navigate(`/patients/${row.id}`);
                                if (key === "edit" && writable) setEditing(row);
                                if (key === "archive" && writable) {
                                  void supabase
                                    .from("patients")
                                    .update({ archived_at: new Date().toISOString() })
                                    .eq("id", row.id)
                                    .then(({ error }) => {
                                      if (error) toast.danger(error.message);
                                      else {
                                        toast.success(t("archivedOk"));
                                        setRows((prev) => prev.filter((r) => r.id !== row.id));
                                      }
                                    });
                                }
                              }}
                            >
                              <Dropdown.Item id="view" textValue={t("view")}>
                                <Label>{t("view")}</Label>
                              </Dropdown.Item>
                              {writable ? (
                                <Dropdown.Item id="edit" textValue={t("edit")}>
                                  <Label>{t("edit")}</Label>
                                </Dropdown.Item>
                              ) : null}
                              {writable ? (
                                <Dropdown.Item id="archive" textValue={t("archive")} variant="danger">
                                  <Label>{t("archive")}</Label>
                                </Dropdown.Item>
                              ) : null}
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
          <Table.Footer className="flex justify-end p-3">
            <Pagination>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous isDisabled={page === 1} onPress={() => setPage((p) => p - 1)}>
                    <Pagination.PreviousIcon />
                  </Pagination.Previous>
                </Pagination.Item>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, page - 3), page + 2)
                  .map((p) => (
                    <Pagination.Item key={p}>
                      <Pagination.Link isActive={p === page} onPress={() => setPage(p)}>
                        {p}
                      </Pagination.Link>
                    </Pagination.Item>
                  ))}
                <Pagination.Item>
                  <Pagination.Next isDisabled={page === totalPages} onPress={() => setPage((p) => p + 1)}>
                    <Pagination.NextIcon />
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          </Table.Footer>
        </Table>
      )}
      {editing ? (
        <PatientFormModal
          patient={editing}
          isOpen
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}
