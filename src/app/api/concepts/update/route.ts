import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function nextReviewDaysByScore(score: number) {
  //ダミー score(0-3)で復習間隔を決める
  if (score >= 3) return 7;
  if (score === 2) return 3;
  if (score === 1) return 1;
  return 0; //0点は今日もう一回、みたいな扱い
}

function deltaStrengthByScore(score: number) {
  //ダミー score(0-3)で強さを増減
  if (score >= 3) return +10;
  if (score === 2) return +5;
  if (score === 1) return +1;
  return -5;
}

export async function POST(req: Request) {

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const attemptId = Number((body as { attemptId?: unknown }).attemptId);
  const userKey = String((body as { userKey?: unknown }).userKey ?? "demo"); // Auth入れるまで固定でOK

  if (!Number.isFinite(attemptId)) {
    return Response.json({ ok: false, error: "attemptId is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  //attempt を取る（scoreが必要）
  const { data: attempt, error: aErr } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, score")
    .eq("id", attemptId)
    .single();

  if (aErr || !attempt) {
    return Response.json({ ok: false, error: "attempt not found" }, { status: 404 });
  }

  if (attempt.score === null || attempt.score === undefined) {
    return Response.json(
      { ok: false, error: "score is null. run /grade first." },
      { status: 400 }
    );
  }

  const score = Number(attempt.score);
  if (!Number.isFinite(score)) {
    return Response.json({ ok: false, error: "invalid score" }, { status: 500 });
  }

  //quiz から problem_id を取る
  const { data: quiz, error: qErr } = await supabase
    .from("quiz_items")
    .select("id, problem_id")
    .eq("id", attempt.quiz_id)
    .single();

  if (qErr || !quiz) {
    return Response.json({ ok: false, error: "quiz not found" }, { status: 404 });
  }

  //problem から concepts を取る（無ければ generalを取る）
  const { data: problem, error: pErr } = await supabase
    .from("problems")
    .select("id, concepts")
    .eq("id", quiz.problem_id)
    .single();

  if (pErr || !problem) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }

  const concepts = Array.isArray(problem.concepts) && problem.concepts.length > 0
    ? (problem.concepts as string[])
    : ["general"];

  const delta = deltaStrengthByScore(score);
  const days = nextReviewDaysByScore(score);
  const nextReviewAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  //concepts ごとに user_concept_state を更新
  const results = await Promise.all(
    concepts.map(async (concept_key) => {
      // 現在の値を取る
      const { data: state, error: sErr } = await supabase
        .from("user_concept_state")
        .select("id, strength")
        .eq("user_key", userKey)
        .eq("concept_key", concept_key)
        .maybeSingle();

      if (sErr) throw sErr;

      const current = state?.strength ?? 0;
      const updatedStrength = clamp(current + delta, 0, 100);

      //upsert（同じ user_keyとconcept_key があれば更新）
      const { data: up, error: upErr } = await supabase
        .from("user_concept_state")
        .upsert(
          {
            user_key: userKey,
            concept_key,
            strength: updatedStrength,
            last_score: score,
            last_attempt_id: attemptId,
            next_review_at: nextReviewAt,
            updated_at: nowIso,
          },
          { onConflict: "user_key,concept_key" }
        )
        .select("*")
        .single();

      if (upErr || !up) throw upErr ?? new Error("failed to upsert state");
      return up;
    })
  );

  return Response.json({
    ok: true,
    userKey,
    attemptId,
    score,
    concepts,
    states: results,
  });
}