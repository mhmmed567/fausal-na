import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Spinner } from "@heroui/react/spinner";
import { Table } from "@heroui/react/table";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { formatDateTime } from "../lib/format";
import { EmptyState } from "../components/EmptyState";
import type { ActivityLog, Category, DashboardStats, Patient } from "../lib/types";

export function DashboardPage() {
  const { t, locale, categoryName } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: statsData }, { data: recent }, { data: acts }, { data: cats }, { data: allPatients }] =
        await Promise.all([
          supabase.rpc("dashboard_stats"),
          supabase
            .from("patients")
            .select("id, full_name, primary_phone, last_contact_at, category_id, categories(name_en, name_ar)")
            .is("archived_at", null)
            .order("updated_at", { ascending: false })
            .limit(6),
          supabase
            .from("activity_logs")
            .select("id, action, entity_type, created_at, actor_type")
            .order("created_at", { ascending: false })
            .limit(8),
          supabase.from("categories").select("id, slug, name_en, name_ar").eq("status", "active"),
          supabase.from("patients").select("category_id").is("archived_at", null),
        ]);
      setStats(statsData as DashboardStats);
      setPatients((recent ?? []) as unknown as Patient[]);
      setActivity((acts ?? []) as ActivityLog[]);
      const counts = new Map<string, number>();
      for (const row of allPatients ?? []) {
        const key = (row as { category_id: string | null }).category_id ?? "uncategorized";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const breakdown = ((cats ?? []) as Category[]).map((c) => ({
        name: categoryName(c.name_en, c.name_ar),
        count: counts.get(c.id) ?? 0,
      }));
      breakdown.push({ name: t("uncategorized"), count: counts.get("uncategorized") ?? 0 });
      setCategories(breakdown);
      setLoading(false);
    }
    void load();
  }, [categoryName, t]);

  if (loading) return <Spinner />;

  const cards = [
    [t("totalPatients"), stats?.total_patients ?? 0],
    [t("newThisMonth"), stats?.new_patients_this_month ?? 0],
    [t("messagesToday"), stats?.messages_today ?? 0],
    [t("activePatients"), stats?.active_patients ?? 0],
    [t("medications"), stats?.medications ?? 0],
    [t("categories"), stats?.categories ?? 0],
  ] as const;
  const maxCat = Math.max(1, ...categories.map((c) => c.count));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("overview")}</h1>
        <p className="mt-1 text-sm text-muted">{t("overviewHint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label} className="border border-border bg-surface p-5 shadow-none">
            <Card.Header className="p-0">
              <Card.Description>{label}</Card.Description>
              <Card.Title className="text-3xl font-semibold tabular-nums">{value}</Card.Title>
            </Card.Header>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("recentPatients")}</h2>
          {patients.length === 0 ? (
            <EmptyState title={t("emptyPatients")} hint={t("emptyPatientsHint")} />
          ) : (
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label={t("recentPatients")}>
                  <Table.Header>
                    <Table.Column isRowHeader>{t("name")}</Table.Column>
                    <Table.Column>{t("phone")}</Table.Column>
                    <Table.Column>{t("category")}</Table.Column>
                    <Table.Column>{t("lastContact")}</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {patients.map((p) => {
                      const cat = (p as unknown as { categories?: { name_en: string; name_ar: string } }).categories;
                      return (
                        <Table.Row key={p.id}>
                          <Table.Cell>
                            <Link className="font-medium hover:underline" to={`/patients/${p.id}`}>
                              {p.full_name}
                            </Link>
                          </Table.Cell>
                          <Table.Cell>{p.primary_phone}</Table.Cell>
                          <Table.Cell>{cat ? categoryName(cat.name_en, cat.name_ar) : t("uncategorized")}</Table.Cell>
                          <Table.Cell>{formatDateTime(p.last_contact_at, locale)}</Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("recentActivity")}</h2>
          {activity.length === 0 ? (
            <EmptyState title={t("emptyActivity")} />
          ) : (
            <ul className="space-y-3">
              {activity.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{item.action}</p>
                    <p className="text-xs text-muted">{item.entity_type}</p>
                  </div>
                  <Chip size="sm" variant="soft">
                    {formatDateTime(item.created_at, locale)}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("patientCategories")}</h2>
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          {categories.map((c) => (
            <div key={c.name} className="flex items-center gap-4">
              <span className="w-40 shrink-0 text-sm">{c.name}</span>
              <div className="h-2 flex-1 rounded-full bg-default">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${(c.count / maxCat) * 100}%` }} />
              </div>
              <span className="w-8 text-end text-sm tabular-nums text-muted">{c.count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
