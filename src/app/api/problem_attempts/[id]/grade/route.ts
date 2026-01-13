//問題のattemptを採点するAPI
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function normalize(s: string) {
  return s.replace(/\s+/g, "").trim();
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const attemptId = Number(idStr);

  if (!Number.isFinite(attemptId)) {
    return Response.json({ ok: false, error: "invalid attempt id" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  //attemptをsupabaseから取る
  const { data: attempt, error: aErr } = await supabase
    .from("problem_attempts")
    .select("id, problem_id, answer")
    .eq("id", attemptId)
    .single();

  if (aErr || !attempt) {
    return Response.json({ ok: false, error: "attempt not found" }, { status: 404 });
  }

  const answer = String(attempt.answer ?? "").trim();
  if (!answer) {
    return Response.json({ ok: false, error: "answer is empty" }, { status: 400 });
  }

  //problems から correct_answer を取る
  const { data: problem, error: pErr } = await supabase
    .from("problems")
    .select("id, correct_answer, problem_statement")
    .eq("id", attempt.problem_id)
    .single();

  if (pErr || !problem) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }

  const correct = String(problem.correct_answer ?? "").trim();
  if (!correct) {
    return Response.json(
      { ok: false, error: "correct_answer is empty. set it in problems first." },
      { status: 400 }
    );
  }

  //ダミーでの採点（完全一致）
  const isCorrect = normalize(answer) === normalize(correct);
  const score = isCorrect ? 1 : 0;
  const feedback = isCorrect ? "正解です。" : `不正解です。想定解: ${correct}`;

  //attemptを更新
  const nowIso = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase
    .from("problem_attempts")
    .update({
      is_correct: isCorrect,
      score,
      feedback,
      graded_at: nowIso,
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

  //次フェーズに進めるか（条件式はここで返す）
  const canProceed = isCorrect;

  return Response.json({
    ok: true,
    canProceed,
    problem: { id: problem.id, problem_statement: problem.problem_statement },
    attempt: updated,
  });
}