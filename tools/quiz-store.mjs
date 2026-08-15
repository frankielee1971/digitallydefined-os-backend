// tools/quiz-store.mjs
// Lightweight quiz-result store used by api/index.js (action: quiz.history).
// Reads quiz results from the Supabase `quiz_results` table via the REST API.
// Degrades gracefully (returns empty results) when Supabase env vars are missing.

async function listQuizResults({ email, resultKey, limit = 20 } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("[quiz-store] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; returning empty results");
    return { results: [], error: "Supabase not configured" };
  }

  try {
    const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/quiz_results`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", String(Math.min(Number(limit) || 20, 100)));

    if (email) url.searchParams.set("email", `eq.${email}`);
    if (resultKey) url.searchParams.set("result_key", `eq.${resultKey}`);

    const res = await fetch(url.toString(), {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!res.ok) {
      return { results: [], error: `quiz_results query failed: ${res.status}` };
    }

    const data = await res.json();
    return { results: Array.isArray(data) ? data : [] };
  } catch (err) {
    return { results: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export { listQuizResults };
export default { listQuizResults };
