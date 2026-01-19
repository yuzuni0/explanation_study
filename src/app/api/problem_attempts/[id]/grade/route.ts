//問題のattemptを採点するAPI
import { createClient } from "@supabase/supabase-js";
import { evaluate } from "mathjs";

export const runtime = "nodejs";

function normalize(s: string) {
  return s.replace(/\s+/g, "").trim();
}

//OCRで読み込まれやすい記号を標準的な演算子に変換
function normalizeExpr(s: string) {
  return s
    .replace(/\s+/g, "")
    .replace(/[×✕xX]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[−ー]/g, "-");
}

//数式として評価して数値比較を試みる
function tryMathEvaluation(answer: string, correct: string): { success: boolean; isCorrect?: boolean } {
  try {
    //入力正規化（OCR対応）
    const normalizedAnswer = normalizeExpr(answer);
    const normalizedCorrect = normalizeExpr(correct);

    //許可文字チェック（数字、演算子、括弧、小数点、基本的な数学記号のみ）
    const allowedPattern = /^[0-9+\-*/().^s]+$/;
    if (!allowedPattern.test(normalizedAnswer) || !allowedPattern.test(normalizedCorrect)) {
      return { success: false };
    }

    //evaluate()で数式評価
    const answerValue = evaluate(normalizedAnswer);
    const correctValue = evaluate(normalizedCorrect);

    //数値以外の結果は扱わない
    if (typeof answerValue !== "number" || typeof correctValue !== "number") {
      return { success: false };
    }

    //数値比較（浮動小数点の誤差を考慮）
    const epsilon = 1e-10;
    const isCorrect = Math.abs(answerValue - correctValue) < epsilon;

    return { success: true, isCorrect };
  } catch {
    //評価失敗
    return { success: false };
  }
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

  //まず数式評価を試みる
  const mathResult = tryMathEvaluation(answer, correct);
  let isCorrect: boolean;
  let feedback: string;

  if (mathResult.success) {
    //数式評価成功
    isCorrect = mathResult.isCorrect!;
    feedback = isCorrect ? "正解です。" : `不正解です。想定解: ${correct}`;
  } else {
    //数式評価失敗 → 文字列一致で判定
    isCorrect = normalize(answer) === normalize(correct);
    feedback = isCorrect ? "正解です。" : `不正解です。想定解: ${correct}`;
  }

  const score = isCorrect ? 1 : 0;

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