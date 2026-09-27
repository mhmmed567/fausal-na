import { useEffect, useState } from "react";
import { Spinner } from "@heroui/react/spinner";
import { Table } from "@heroui/react/table";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { formatDateTime } from "../lib/format";
import { EmptyState } from "../components/EmptyState";
import type { ActivityLog } from "../lib/types";

export function ActivityPage() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setRows((data as ActivityLog[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("activity")}</h1>
      {rows.length === 0 ? (
        <EmptyState title={t("emptyActivity")} />
      ) : (
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t("activity")} className="min-w-[800px]">
            <Table.Header>
              <Table.Column isRowHeader>{t("user")}</Table.Column>
              <Table.Column>{t("action")}</Table.Column>
              <Table.Column>{t("entity")}</Table.Column>
              <Table.Column>{t("record")}</Table.Column>
              <Table.Column>{t("date")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>
                    {row.actor_type === "mcp" ? "MCP" : row.profiles?.full_name ?? row.actor_type}
                  </Table.Cell>
                  <Table.Cell>{row.action}</Table.Cell>
                  <Table.Cell>{row.entity_type}</Table.Cell>
                  <Table.Cell className="font-mono text-xs">{row.entity_id?.slice(0, 8) ?? "—"}</Table.Cell>
                  <Table.Cell>{formatDateTime(row.created_at, locale)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      )}
    </div>
  );
}
