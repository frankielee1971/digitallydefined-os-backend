// lib/persist.js — guarded Supabase writes (a missing table never throws).
import { supabase } from "./supabaseClient.js";

export async function guardInsert(table, payload) {
  try {
    await supabase.from(table).insert(payload);
    return { ok: true, table };
  } catch (e) {
    console.warn(`[persist] skipped ${table}:`, e?.message || e);
    return { ok: false, table };
  }
}

export default { guardInsert };
