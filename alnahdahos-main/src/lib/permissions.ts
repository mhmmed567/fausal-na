import type { AppRole } from "./types";

export type Module =
  | "dashboard"
  | "patients"
  | "messages"
  | "medications"
  | "conditions"
  | "notes"
  | "categories"
  | "activity"
  | "users"
  | "roles"
  | "mcp"
  | "settings";

const ROLE_ACCESS: Record<AppRole, { read: Module[]; write: Module[] }> = {
  admin: {
    read: [
      "dashboard",
      "patients",
      "messages",
      "medications",
      "conditions",
      "notes",
      "categories",
      "activity",
      "users",
      "roles",
      "mcp",
      "settings",
    ],
    write: [
      "patients",
      "messages",
      "medications",
      "conditions",
      "notes",
      "categories",
      "users",
      "roles",
      "mcp",
      "settings",
    ],
  },
  doctor: {
    read: ["dashboard", "patients", "medications", "conditions", "notes", "categories", "activity"],
    write: ["patients", "medications", "conditions", "notes"],
  },
  staff: {
    read: ["dashboard", "patients", "messages", "notes", "categories", "activity", "medications"],
    write: ["patients", "messages", "notes"],
  },
  viewer: {
    read: ["dashboard", "patients", "messages", "medications", "conditions", "notes", "categories", "activity"],
    write: [],
  },
};

export function canRead(role: AppRole | null | undefined, module: Module): boolean {
  if (!role) return false;
  return ROLE_ACCESS[role].read.includes(module);
}

export function canWrite(role: AppRole | null | undefined, module: Module): boolean {
  if (!role) return false;
  return ROLE_ACCESS[role].write.includes(module);
}

export function navModules(role: AppRole | null | undefined): Module[] {
  if (!role) return [];
  const items: Module[] = ["dashboard", "patients", "messages", "medications", "categories", "activity", "settings"];
  return items.filter((m) => canRead(role, m) || m === "settings");
}
