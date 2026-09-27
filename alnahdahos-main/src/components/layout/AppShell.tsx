import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Pill,
  Tags,
  History,
  Settings,
  Menu,
  Languages,
} from "lucide-react";
import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Drawer } from "@heroui/react/drawer";
import { SearchField } from "@heroui/react/search-field";
import { Separator } from "@heroui/react/separator";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { canRead, type Module } from "../../lib/permissions";
import { initials } from "../../lib/format";
import { useState } from "react";

const NAV: { to: string; key: Module; icon: typeof LayoutDashboard }[] = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { to: "/patients", key: "patients", icon: Users },
  { to: "/messages", key: "messages", icon: MessageSquare },
  { to: "/medications", key: "medications", icon: Pill },
  { to: "/categories", key: "categories", icon: Tags },
  { to: "/activity", key: "activity", icon: History },
  { to: "/settings", key: "settings", icon: Settings },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.filter((item) => canRead(profile?.role, item.key) || item.key === "settings").map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-accent text-accent-foreground" : "text-muted hover:bg-default/70 hover:text-foreground"
              }`
            }
          >
            <Icon className="size-4 shrink-0" />
            {t(item.key === "settings" ? "settings" : (item.key as "dashboard"))}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground">
        ن
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight">{t("appName")}</p>
        <p className="text-xs text-muted">{t("orgName")}</p>
      </div>
    </div>
  );
}

export function AppShell() {
  const { t, locale, toggleLocale } = useI18n();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  function submitSearch(value: string) {
    const q = value.trim();
    if (!q) return;
    navigate(`/patients?q=${encodeURIComponent(q)}`);
    setOpen(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-border bg-surface md:flex md:flex-col">
        <Brand />
        <Separator />
        <div className="flex-1 overflow-y-auto py-4">
          <NavItems />
        </div>
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <Avatar.Fallback>{initials(profile?.full_name || "U")}</Avatar.Fallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="text-xs text-muted">{profile?.role}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur md:px-8">
          <Drawer>
            <Button isIconOnly variant="ghost" className="md:hidden" aria-label="Menu" onPress={() => setOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <Drawer.Backdrop isOpen={open} onOpenChange={setOpen}>
              <Drawer.Content placement={locale === "ar" ? "right" : "left"} className="w-64">
                <Drawer.Dialog>
                  <Drawer.Header>
                    <Drawer.Heading>{t("appName")}</Drawer.Heading>
                  </Drawer.Header>
                  <Drawer.Body className="px-0">
                    <NavItems onNavigate={() => setOpen(false)} />
                  </Drawer.Body>
                </Drawer.Dialog>
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>

          <SearchField
            className="max-w-xl flex-1"
            name="global-search"
            onSubmit={submitSearch}
            value={query}
            onChange={setQuery}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={t("searchPlaceholder")} />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>

          <div className="ms-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onPress={toggleLocale}>
              <Languages className="size-4" />
              {t("language")}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => void signOut()}>
              {t("signOut")}
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
