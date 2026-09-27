import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Alert } from "@heroui/react/alert";
import { Button } from "@heroui/react/button";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextField } from "@heroui/react/textfield";
import { toast } from "@heroui/react/toast";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

export function LoginPage() {
  const { session, signIn } = useAuth();
  const { t, toggleLocale } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <button
        type="button"
        className="absolute end-4 top-4 text-sm text-muted hover:text-foreground"
        onClick={toggleLocale}
      >
        {t("language")}
      </button>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-accent-foreground">
            ن
          </div>
          <p className="text-sm text-muted">{t("orgName")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("appName")}</h1>
          <p className="mt-2 text-sm text-muted">{t("staffPortal")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
          {error ? (
            <Alert status="danger" className="mb-4">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{error}</Alert.Title>
              </Alert.Content>
            </Alert>
          ) : null}
          <Form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError(null);
              const message = await signIn(email.trim(), password);
              setPending(false);
              if (message) {
                setError(message);
                return;
              }
              toast.success(t("signIn"));
            }}
          >
            <TextField isRequired name="email" type="email" value={email} onChange={setEmail} autoComplete="username">
              <Label>{t("email")}</Label>
              <Input placeholder="admin@nahdha.local" />
            </TextField>
            <TextField isRequired name="password" type="password" value={password} onChange={setPassword} autoComplete="current-password">
              <Label>{t("password")}</Label>
              <Input />
            </TextField>
            <Button type="submit" isDisabled={pending || !email || !password} className="mt-2 w-full">
              {t("signIn")}
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
