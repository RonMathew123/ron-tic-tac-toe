import { supabase } from "@/integrations/supabase/client";

// Returns a stable per-browser player id backed by a Supabase anonymous
// session. auth.uid() on the server matches this value, which is what the
// RLS policies on public.games check against.
export async function ensurePlayerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id) return data.session.user.id;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  const uid = signed.session?.user?.id ?? signed.user?.id;
  if (!uid) throw new Error("Could not establish an anonymous session");
  return uid;
}

// Legacy sync accessor kept for callers that only need a best-effort id.
// Prefer ensurePlayerId() before any DB write.
export function getPlayerId(): string {
  return "";
}
