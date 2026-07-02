//問題のattemptを採点するAPI
import { createClient } from "@supabase/supabase-js";
import { evaluate } from "mathjs";
import { OpenAI } from "openai";

export const runtime = "nodejs";

function normalize(s: string) {
  return s.replace(/\s+/g, "").trim();
}

//OCRで読み込まれやすい記号を標準的な演算子に変換
function normalizeExpr(s: string) {
  return s
    .replace(/\s+/g, "")
    .replace(/[✕xX]/g, "*")
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
    const allowedPattern = /^[0-9+\-*/().^]+$/;
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

async function checkAnswers(answer: string, correct: string): Promise<{ boolean: boolean; string: string }> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("extractCorrectAnswer: OPENAI_API_KEY is not set");
    return Promise.resolve({ boolean: false, string: "" });
  }

  if (!answer || answer.trim().length === 0) {
    return Promise.resolve({ boolean: false, string: "" });
  }

  if (!correct || correct.trim().length === 0) {
    return Promise.resolve({ boolean: false, string: "" });
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `以下は正解とユーザーの回答です。ユーザーの回答が正解かどうかを判定してください。

正解: ${correct}
ユーザーの回答: ${answer}

追加指示:
- 選択問題の場合は正しい選択肢（例: "ア", "3", "(2)"など）を返してください。
- 正解と回答の形式が異なる場合は、数学的に同じ値であれば正解とみなしてください。
- 出力は "true" または "false" の文字列のみとし、それ以外の説明は不要です。`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: 1000,
    });
    const text = response.choices[0].message.content ?? "";
    const isCorrect = text.toLowerCase().includes("true");

    return Promise.resolve({ boolean: isCorrect, string: text });
  } catch (error) {
    console.error("extractCorrectAnswer: OpenAI API error", error);
    return Promise.resolve({ boolean: false, string: "" });
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
    if (normalize(answer) === normalize(correct)) {
      isCorrect = true;
      feedback = isCorrect ? "正解です。" : `不正解です。想定解: ${correct}`;
    } else {
      const checkResult = await checkAnswers(answer, correct);
      isCorrect = checkResult.boolean;
      feedback = isCorrect ? "正解です。" : `不正解です。想定解: ${correct}`;
    }
  }

  const score = isCorrect ? 1 : 0;

  //latestをgraded_atで同じ時刻を使う
  const gradedAt = new Date().toISOString();

  //採点をしたタイミングで履歴を別テーブルにinsertする
  const { error: histErr } = await supabase
    .from("problem_attempt_grade_history")//これがテーブル名
    .insert({
      attempt_id: attemptId,
      answer,
      correct_answer: correct,
      is_correct: isCorrect,
      score,
      feedback,
      graded_at: gradedAt,
    });

  if (histErr) {
    return Response.json({ ok: false, error: histErr.message }, { status: 500 });
  }

  //latestをupdate　現在の値を見る
  const { data: updated, error: upErr } = await supabase
    .from("problem_attempts")
    .update({
      is_correct: isCorrect,
      score,
      feedback,
      graded_at: gradedAt,
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