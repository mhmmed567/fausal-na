import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Checkbox } from "@heroui/react/checkbox";
import { Chip } from "@heroui/react/chip";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { Select } from "@heroui/react/select";
import { Table } from "@heroui/react/table";
import { Tabs } from "@heroui/react/tabs";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { canRead, canWrite } from "../lib/permissions";
import { formatDateTime } from "../lib/format";
import { mcpEndpoint } from "../lib/mcp";
import { MCP_PERMISSIONS, type AppRole, type McpClient, type McpLog, type Profile } from "../lib/types";

export function SettingsPage() {
  const { tab = "general" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { profile } = useAuth();
  const selected = tab === "users" || tab === "roles" || tab === "mcp" ? tab : "general";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("settings")}</h1>
      <Tabs selectedKey={selected} onSelectionChange={(key) => navigate(`/settings/${String(key)}`)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={t("settings")}>
            <Tabs.Tab id="general">{t("general")}<Tabs.Indicator /></Tabs.Tab>
            {canRead(profile?.role, "users") ? <Tabs.Tab id="users">{t("users")}<Tabs.Indicator /></Tabs.Tab> : null}
            {canRead(profile?.role, "roles") ? <Tabs.Tab id="roles">{t("roles")}<Tabs.Indicator /></Tabs.Tab> : null}
            {canRead(profile?.role, "mcp") ? <Tabs.Tab id="mcp">{t("mcp")}<Tabs.Indicator /></Tabs.Tab> : null}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="general" className="pt-5"><GeneralPanel /></Tabs.Panel>
        <Tabs.Panel id="users" className="pt-5"><UsersPanel /></Tabs.Panel>
        <Tabs.Panel id="roles" className="pt-5"><RolesPanel /></Tabs.Panel>
        <Tabs.Panel id="mcp" className="pt-5"><McpPanel /></Tabs.Panel>
      </Tabs>
    </div>
  );
}

function GeneralPanel() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role, "settings");
  const [value, setValue] = useState<Record<string, string>>({});

  useEffect(() => {
    void supabase.from("settings").select("value").eq("key", "general").maybeSingle().then(({ data }) => {
      setValue(((data?.value as Record<string, string>) ?? {}));
    });
  }, []);

  return (
    <Form
      className="max-w-lg space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!writable) return;
        const fd = new FormData(e.currentTarget);
        const next = {
          org_name_ar: String(fd.get("org_name_ar") || ""),
          org_name_en: String(fd.get("org_name_en") || ""),
          phone: String(fd.get("phone") || ""),
          city: String(fd.get("city") || ""),
        };
        const { error } = await supabase.from("settings").upsert({ key: "general", value: next, updated_by: profile?.id });
        if (error) return toast.danger(error.message);
        toast.success(t("saved"));
      }}
    >
      <TextField name="org_name_ar" defaultValue={value.org_name_ar} isDisabled={!writable}><Label>{t("orgNameAr")}</Label><Input /></TextField>
      <TextField name="org_name_en" defaultValue={value.org_name_en} isDisabled={!writable}><Label>{t("orgNameEn")}</Label><Input /></TextField>
      <TextField name="phone" defaultValue={value.phone} isDisabled={!writable}><Label>{t("phone")}</Label><Input /></TextField>
      <TextField name="city" defaultValue={value.city} isDisabled={!writable}><Label>{t("city")}</Label><Input /></TextField>
      {writable ? <Button type="submit">{t("save")}</Button> : null}
    </Form>
  );
}

function UsersPanel() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role, "users");
  const [rows, setRows] = useState<Profile[]>([]);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setRows((data as Profile[]) ?? []);
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      {writable ? <CreateUserForm onSaved={() => void load()} /> : null}
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t("users")}>
            <Table.Header>
              <Table.Column isRowHeader>{t("name")}</Table.Column>
              <Table.Column>{t("email")}</Table.Column>
              <Table.Column>{t("roles")}</Table.Column>
              <Table.Column>{t("status")}</Table.Column>
              <Table.Column>{t("created")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>{row.full_name}</Table.Cell>
                  <Table.Cell>{row.email}</Table.Cell>
                  <Table.Cell><RoleSelect profile={row} disabled={!writable} onSaved={() => void load()} /></Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" color={row.is_active ? "success" : "warning"}>{row.is_active ? t("active") : t("inactive")}</Chip>
                  </Table.Cell>
                  <Table.Cell>{formatDateTime(row.created_at, locale)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

function RoleSelect({ profile, disabled, onSaved }: { profile: Profile; disabled: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  return (
    <Select
      selectedKey={profile.role}
      isDisabled={disabled}
      className="w-36"
      onSelectionChange={async (key) => {
        if (!key) return;
        const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: profile.id, p_role: String(key), p_is_active: profile.is_active });
        if (error) toast.danger(error.message);
        else onSaved();
      }}
    >
      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
      <Select.Popover>
        <ListBox>
          {(["admin", "doctor", "staff", "viewer"] as AppRole[]).map((role) => (
            <ListBox.Item key={role} id={role} textValue={t(`role${role[0].toUpperCase()}${role.slice(1)}` as "roleAdmin")}>
              {t(`role${role[0].toUpperCase()}${role.slice(1)}` as "roleAdmin")}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function CreateUserForm({ onSaved }: { onSaved: () => void }) {
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
                const { error } = await supabase.rpc("admin_create_user", {
                  p_email: String(fd.get("email")),
                  p_password: String(fd.get("password")),
                  p_full_name: String(fd.get("full_name")),
                  p_role: String(fd.get("role") || "staff"),
                });
                if (error) return toast.danger(error.message);
                toast.success(t("saved"));
                onSaved();
              }}
            >
              <Modal.Header><Modal.Heading>{t("users")}</Modal.Heading></Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <TextField isRequired name="full_name"><Label>{t("name")}</Label><Input /></TextField>
                <TextField isRequired name="email" type="email"><Label>{t("email")}</Label><Input /></TextField>
                <TextField isRequired name="password" type="password"><Label>{t("password")}</Label><Input /></TextField>
                <Select name="role" defaultSelectedKey="staff">
                  <Label>{t("roles")}</Label>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="admin">{t("roleAdmin")}<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="doctor">{t("roleDoctor")}<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="staff">{t("roleStaff")}<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="viewer">{t("roleViewer")}<ListBox.ItemIndicator /></ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">{t("cancel")}</Button>
                <Button type="submit">{t("create")}</Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function RolesPanel() {
  const { t } = useI18n();
  const rows = [
    { role: t("roleAdmin"), access: t("fullAccess") },
    { role: t("roleDoctor"), access: `${t("patients")} / ${t("medications")} / ${t("conditions")} / ${t("notes")}` },
    { role: t("roleStaff"), access: `${t("patients")} / ${t("messages")} / ${t("notes")}` },
    { role: t("roleViewer"), access: t("readOnly") },
  ];
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={t("roles")}>
          <Table.Header>
            <Table.Column isRowHeader>{t("roles")}</Table.Column>
            <Table.Column>{t("permissions")}</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.role}>
                <Table.Cell>{r.role}</Table.Cell>
                <Table.Cell>{r.access}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function McpPanel() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role, "mcp");
  const [clients, setClients] = useState<McpClient[]>([]);
  const [logs, setLogs] = useState<McpLog[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const endpoint = mcpEndpoint();
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint.replace(/\/mcp$/, "/health"), { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => setReady(Boolean(data?.ready))).catch(() => { if (!controller.signal.aborted) setReady(false); });
    return () => controller.abort();
  }, [endpoint]);

  async function load() {
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase.from("mcp_clients").select("id, name, status, permissions, token_prefix, last_used_at, last_tool_call, created_at").order("created_at"),
      supabase.from("mcp_logs").select("*, mcp_clients(name)").order("created_at", { ascending: false }).limit(15),
    ]);
    setClients((c as McpClient[]) ?? []);
    setLogs((l as McpLog[]) ?? []);
  }
  useEffect(() => { void load(); }, []);

  const last = logs[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("mcpStatus")} value={ready === null ? "…" : ready ? t("running") : t("mcpOfflineSite")} />
        <Stat label={t("endpoint")} value={endpoint || t("mcpHostedNote")} />
        <Stat label={t("authentication")} value="OAuth · mcp:tools / Bearer" />
        <Stat label={t("lastToolCall")} value={last ? `${last.tool} · ${formatDateTime(last.created_at, locale)}` : "—"} />
      </div>
      <p className="text-sm text-muted">{locale === "ar" ? "نطاق OAuth هو mcp:tools؛ صلاحيات القراءة والكتابة تحدد أدناه لكل عميل. تشغيل Hermes دون واجهة يتطلب توكن Bearer أو تفويض OAuth محفوظًا داخل نفس بروفايل مازن. إنشاء عميل هنا لا يحفظ التفويض في الجهاز البعيد." : "OAuth scope: mcp:tools. Select read/write permissions per client below. Headless Hermes needs a Bearer token or cached OAuth authorization in the same Mazen profile."}</p>
      {writable ? <CreateMcpClient onCreated={(plain) => { setToken(plain); void load(); }} /> : null}
      {token ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium">{t("tokenOnce")}</p>
          <code className="mt-2 block break-all text-sm">{token}</code>
          <Button size="sm" className="mt-3" variant="secondary" onPress={() => void navigator.clipboard.writeText(token)}>
            {t("copy")}
          </Button>
        </div>
      ) : null}
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="MCP clients" className="min-w-[800px]">
            <Table.Header>
              <Table.Column isRowHeader>{t("client")}</Table.Column>
              <Table.Column>{t("status")}</Table.Column>
              <Table.Column>{t("permissions")}</Table.Column>
              <Table.Column>{t("lastUsed")}</Table.Column>
              <Table.Column>{t("created")}</Table.Column>
              <Table.Column>{t("actions")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {clients.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted">{row.token_prefix}…</p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" color={row.status === "active" ? "success" : "warning"}>
                      {row.status === "active" ? t("active") : t("inactive")}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell className="max-w-xs text-xs">{row.permissions.join(", ")}</Table.Cell>
                  <Table.Cell>{formatDateTime(row.last_used_at, locale)}</Table.Cell>
                  <Table.Cell>{formatDateTime(row.created_at, locale)}</Table.Cell>
                  <Table.Cell>
                    {writable ? (
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" onPress={async () => {
                          await supabase.from("mcp_clients").update({ status: row.status === "active" ? "disabled" : "active" }).eq("id", row.id);
                          void load();
                        }}>{row.status === "active" ? t("disable") : t("active")}</Button>
                        <Button size="sm" variant="ghost" onPress={async () => {
                          const plain = `ndh_live_${crypto.randomUUID().replace(/-/g, "")}`;
                          const { data } = await supabase.rpc("hash_mcp_token", { p_token: plain });
                          await supabase.from("mcp_clients").update({ token_hash: data, token_prefix: plain.slice(0, 16) }).eq("id", row.id);
                          setToken(plain);
                          void load();
                        }}>{t("regenerate")}</Button>
                        <EditPermissions client={row} onSaved={() => void load()} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-all text-sm font-medium">{value}</p>
    </div>
  );
}

function CreateMcpClient({ onCreated }: { onCreated: (token: string) => void }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  return (
    <Modal>
      <Button>{t("createMcpClient")}</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const name = String(fd.get("name") || "").trim();
                const permissions = MCP_PERMISSIONS.filter((p) => fd.has(p));
                if (!permissions.length) return toast.danger("اختر صلاحية واحدة على الأقل / Select at least one permission");
                const plain = `ndh_live_${crypto.randomUUID().replace(/-/g, "")}`;
                const { data: hash, error: hashError } = await supabase.rpc("hash_mcp_token", { p_token: plain });
                if (hashError) return toast.danger(hashError.message);
                const { error } = await supabase.from("mcp_clients").insert({
                  name,
                  permissions,
                  token_hash: hash,
                  token_prefix: plain.slice(0, 16),
                  created_by: profile?.id,
                });
                if (error) return toast.danger(error.message);
                onCreated(plain);
              }}
            >
              <Modal.Header><Modal.Heading>{t("createMcpClient")}</Modal.Heading></Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <TextField isRequired name="name" defaultValue="Mazen"><Label>{t("name")}</Label><Input /></TextField>
                <div className="grid grid-cols-2 gap-2">
                  {MCP_PERMISSIONS.map((perm) => (
                    <Checkbox key={perm} name={perm} value="on" defaultSelected>
                      <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                      <span className="text-xs">{perm}</span>
                    </Checkbox>
                  ))}
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">{t("cancel")}</Button>
                <Button type="submit">{t("create")}</Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function EditPermissions({ client, onSaved }: { client: McpClient; onSaved: () => void }) {
  const { t } = useI18n();
  return (
    <Modal>
      <Button size="sm" variant="ghost">{t("editPermissions")}</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const permissions = MCP_PERMISSIONS.filter((p) => fd.has(p));
                if (!permissions.length) return toast.danger("اختر صلاحية واحدة على الأقل / Select at least one permission");
                const { error } = await supabase.from("mcp_clients").update({ permissions }).eq("id", client.id);
                if (error) return toast.danger(error.message);
                toast.success(t("saved"));
                onSaved();
              }}
            >
              <Modal.Header><Modal.Heading>{t("editPermissions")}</Modal.Heading></Modal.Header>
              <Modal.Body className="grid grid-cols-2 gap-2">
                {MCP_PERMISSIONS.map((perm) => (
                  <Checkbox key={perm} name={perm} value="on" defaultSelected={client.permissions.includes(perm)}>
                    <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                    <span className="text-xs">{perm}</span>
                  </Checkbox>
                ))}
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
