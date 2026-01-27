import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Rubric = {
  score_range: "0-3";
  checks: string[];
};

function gradeByRubric(answer: string, rubric: Rubric): {
  score: number;
  feedback: string;
  missing_items: string[];
} {
  //シンプルなルール点を決める(後で変える)
  //checks次第で部分点を与える
  const a = answer.trim();

  const missing: string[] = [];
  const has = (re: RegExp) => re.test(a);

  //固定ルールを後で汎用化させる
  const ok_topic = a.length >= 5; //要点が入っているか
  const ok_conclusion = has(/結論|つまり|要するに|〜だ/);
  const ok_reason = has(/理由|なぜなら|だから/);
  const ok_one_sentence = !has(/\n/) && a.length <= 120;

  const checksResult: [string, boolean][] = [
    [rubric.checks?.[0] ?? "要点", ok_topic],
    [rubric.checks?.[1] ?? "結論", ok_conclusion],
    [rubric.checks?.[2] ?? "理由", ok_reason],
    [rubric.checks?.[3] ?? "1文", ok_one_sentence],
  ];

  for (const [label, passed] of checksResult) {
    if (!passed) missing.push(label);
  }

  const passedCount = checksResult.filter(([, p]) => p).length;

  //passedCountの値に応じてスコアとする
  let score = 0;
  if (passedCount >= 1) score = 1;
  if (passedCount >= 2) score = 2;
  if (passedCount >= 3) score = 3;

  const feedback =
    score === 3
      ? "OK：要点→結論→理由の流れが見えます。"
      : score === 2
      ? `あと少し：不足(${missing.join(" / ")})を補うと満点に近いです。`
      : score === 1
      ? `最低限は書けていますが、不足(${missing.join(" / ")})があります。`
      : `ほぼ未回答です。不足(${missing.join(" / ")})を意識して1文で書いてみてください。`;

  return { score, feedback, missing_items: missing };
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

  //quiz_id と answer があればattempt を取る
  const { data: attempt, error: aErr } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, answer, score")
    .eq("id", attemptId)
    .single();

  if (aErr || !attempt) {
    return Response.json({ ok: false, error: "attempt not found" }, { status: 404 });
  }

  const answer = (attempt.answer ?? "").trim();
  if (!answer) {
    return Response.json({ ok: false, error: "answer is empty" }, { status: 400 });
  }

  //rubric があれば quiz を取る
  const { data: quiz, error: qErr } = await supabase
    .from("quiz_items")
    .select("id, rubric")
    .eq("id", attempt.quiz_id)
    .single();

  if (qErr || !quiz) {
    return Response.json({ ok: false, error: "quiz not found" }, { status: 404 });
  }

  const rubric = quiz.rubric as Rubric | null;
  if (!rubric || rubric.score_range !== "0-3" || !Array.isArray(rubric.checks)) {
    return Response.json({ ok: false, error: "invalid rubric format" }, { status: 500 });
  }

  //採点を実行する部分
  const result = gradeByRubric(answer, rubric);

  //attempt を更新する
  const { data: updated, error: upErr } = await supabase
    .from("quiz_attempts")
    .update({
      score: result.score,
      feedback: result.feedback,

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

  return Response.json({ ok: true, attempt: updated, missing_items: result.missing_items });
}