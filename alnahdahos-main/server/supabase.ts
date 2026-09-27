import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

type AuthOptions = {
  persistSession?: boolean;
  autoRefreshToken?: boolean;
};

let patched = false;

function ensureWebSocket() {
  if (patched) return;
  const g = globalThis as Record<string, unknown>;
  if (typeof g.WebSocket === "undefined") {
    g.WebSocket = WebSocket;
  }
  patched = true;
}

export function createCrmSupabase(url: string, key: string, auth: AuthOptions = {}): SupabaseClient {
  ensureWebSocket();
  return createClient(url, key, {
    auth: {
      persistSession: auth.persistSession ?? false,
      autoRefreshToken: auth.autoRefreshToken ?? false,
    },
    realtime: {
      // Netlify/Node <22 has no native WebSocket; supabase-js requires one at init.
      transport: WebSocket as never,
    },
  });
}
