//gradeでcorrect_answerで正誤判定する前にボタンを押すことでDBにanswerを保存するPATCH
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
function isJsonRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const attemptId = Number(idStr);

  if (!Number.isFinite(attemptId)) {
    return Response.json({ ok: false, error: "invalid attempt id" }, { status: 400 });
  }

  //jsonのbodyを読む
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (!isJsonRecord(body)) {
    return Response.json({ ok: false, error: "json must be object" }, { status: 400 });
  }

  const rawAnswer = body.answer;

  //answerはstringまたはfinite numberのみ許可
  const isValid =
    typeof rawAnswer === "string" ||
    (typeof rawAnswer === "number" && Number.isFinite(rawAnswer));

  if (!isValid) {
    return Response.json(
      { ok: false, error: "answer must be string or finite number" },
      { status: 400 }
    );
  }

  const answer = String(rawAnswer).trim();
  if (!answer) {
    return Response.json({ ok: false, error: "answer is required" }, { status: 400 });
  }

  //Supabaseクライアント作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  //attemptが存在するか確認
  const { data: existing, error: exErr } = await supabase
    .from("problem_attempts")
    .select("id")
    .eq("id", attemptId)
    .single();

  if (exErr || !existing) {
    return Response.json({ ok: false, error: "attempt not found" }, { status: 404 });
  }

  //存在したらanswerを更新
  const { data: updated, error: upErr } = await supabase
    .from("problem_attempts")
    .update({
      answer,
      is_correct: null,
      score: null,
      feedback: null,
      graded_at: null,
    })
    .eq("id", attemptId)
    .select("*")
    .single();

  if (upErr || !updated) {
    return Response.json(
      { ok: false, error: upErr?.message ?? "failed to update attempt" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, attempt: updated });
}