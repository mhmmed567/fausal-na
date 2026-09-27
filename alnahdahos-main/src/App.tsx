import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@heroui/react/spinner";
import { useAuth } from "./lib/auth";
import { canRead, type Module } from "./lib/permissions";
import { useI18n } from "./lib/i18n";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then(({ DashboardPage }) => ({ default: DashboardPage })),
);
const PatientsPage = lazy(() =>
  import("./pages/PatientsPage").then(({ PatientsPage }) => ({ default: PatientsPage })),
);
const PatientProfilePage = lazy(() =>
  import("./pages/PatientProfilePage").then(({ PatientProfilePage }) => ({ default: PatientProfilePage })),
);
const MessagesPage = lazy(() =>
  import("./pages/MessagesPage").then(({ MessagesPage }) => ({ default: MessagesPage })),
);
const MedicationsPage = lazy(() =>
  import("./pages/MedicationsPage").then(({ MedicationsPage }) => ({ default: MedicationsPage })),
);
const MedicationDetailPage = lazy(() =>
  import("./pages/MedicationDetailPage").then(({ MedicationDetailPage }) => ({ default: MedicationDetailPage })),
);
const CategoriesPage = lazy(() =>
  import("./pages/CategoriesPage").then(({ CategoriesPage }) => ({ default: CategoriesPage })),
);
const ActivityPage = lazy(() =>
  import("./pages/ActivityPage").then(({ ActivityPage }) => ({ default: ActivityPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then(({ SettingsPage }) => ({ default: SettingsPage })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <Spinner />
    </div>
  );
}

function Guard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ModuleGuard({ module, children }: { module: Module; children: ReactNode }) {
  const { profile, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <Spinner />;
  if (!canRead(profile?.role, module)) {
    return <p className="text-muted">{t("noAccess")}</p>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Guard>
              <AppShell />
            </Guard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<ModuleGuard module="dashboard"><DashboardPage /></ModuleGuard>} />
          <Route path="patients" element={<ModuleGuard module="patients"><PatientsPage /></ModuleGuard>} />
          <Route path="patients/:id" element={<ModuleGuard module="patients"><PatientProfilePage /></ModuleGuard>} />
          <Route path="messages" element={<ModuleGuard module="messages"><MessagesPage /></ModuleGuard>} />
          <Route path="medications" element={<ModuleGuard module="medications"><MedicationsPage /></ModuleGuard>} />
          <Route path="medications/:id" element={<ModuleGuard module="medications"><MedicationDetailPage /></ModuleGuard>} />
          <Route path="categories" element={<ModuleGuard module="categories"><CategoriesPage /></ModuleGuard>} />
          <Route path="activity" element={<ModuleGuard module="activity"><ActivityPage /></ModuleGuard>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:tab" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
