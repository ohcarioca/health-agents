// eval/supabase.ts
// Direct Supabase admin client for eval — bypasses server-only admin.ts.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type EvalSupabaseClient = ReturnType<typeof createEvalClient>;

export function createEvalClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient<Database>(url, key);
}
