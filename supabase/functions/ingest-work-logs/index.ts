import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-worklog-secret",
};

const VALID_PERSON_KEYS = [
  "wang-dahyun",
  "lim-seyeon",
  "eun-minho",
  "kang-jaeyun",
  "park-hayeon",
  "lee-bora",
  "lee-minwook",
  "hong-yujin",
  "lim-seoyun",
  "lee-minjeong",
] as const;

type WorkLogEntry = {
  person_key: string;
  display_name: string;
  log_date: string;
  work: string;
  notes: string;
  pending: string;
};

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validEntry(value: unknown): value is WorkLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.person_key === "string" &&
    VALID_PERSON_KEYS.includes(entry.person_key as typeof VALID_PERSON_KEYS[number]) &&
    typeof entry.display_name === "string" &&
    entry.display_name.length > 0 &&
    validDate(entry.log_date) &&
    typeof entry.work === "string" &&
    typeof entry.notes === "string" &&
    typeof entry.pending === "string"
  );
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "POST 요청만 허용됩니다." },
      { status: 405, headers: CORS_HEADERS },
    );
  }

  const expectedSecret = Deno.env.get("WORKLOG_INGEST_SECRET") || "";
  const receivedSecret = request.headers.get("x-worklog-secret") || "";
  if (
    !expectedSecret ||
    !(await secureEqual(expectedSecret, receivedSecret))
  ) {
    return Response.json(
      { error: "인증되지 않은 업무일지 수집 요청입니다." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const body = await request.json().catch(() => ({}));
  const entries: unknown[] = Array.isArray(body.entries)
    ? body.entries
    : body.entry
      ? [body.entry]
      : [];

  if (entries.length === 0 || entries.length > 50 || !entries.every(validEntry)) {
    return Response.json(
      { error: "업무일지 데이터 형식이 올바르지 않습니다." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Supabase 서버 환경변수가 없습니다." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let succeeded = 0;
  const errors: string[] = [];

  for (const entry of entries as WorkLogEntry[]) {
    const { data, error } = await supabase.rpc("upsert_work_log", {
      p_person_key: entry.person_key,
      p_display_name: entry.display_name,
      p_log_date: entry.log_date,
      p_work: entry.work,
      p_notes: entry.notes,
      p_pending: entry.pending,
      p_source: "bot",
    });

    if (error) {
      errors.push(`${entry.person_key}/${entry.log_date}: ${error.message}`);
    } else {
      succeeded++;
    }
  }

  return Response.json(
    {
      ok: errors.length === 0,
      succeeded,
      failed: entries.length - succeeded,
      errors,
    },
    { headers: CORS_HEADERS },
  );
});
