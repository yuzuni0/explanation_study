
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Rubric = {
  score_range: "0-3";
  checks: string[];
};

function buildQuizFromOcr(ocrText: string): { question: string; rubric: Rubric } {
  const question =
    `この問題の要点を1文で説明して（できれば「結論→理由」の順で）：\n\n` + ocrText;

  const rubric: Rubric = {
    score_range: "0-3",
    checks: [
      "要点（何の話か）が入っている",
      "結論が明確",
      "理由/根拠がある（短くてOK）",
      "1文になっている（長すぎない）",
    ],
  };
  return { question, rubric };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const problemId = Number(idStr);

  if (!Number.isFinite(problemId)) {
    return Response.json({ ok: false, error: "invalid problem id" }, { status: 400 });
  }

  //bodyは任意（curlで空POSTでも動かせる）
  let body: unknown = {};
  try {
    //content-lengthが0でも例外になることがあるので try/catch
    body = await req.json();
  } catch {
    body = {};
  }
  const rawUserKey = (body as { userKey?: unknown }).userKey;
  const userKey = String(rawUserKey ?? "").trim() || "demo";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  //正解済みかをチェック（最新の problem_attempts を見る）
  const { data: lastAttempt, error: laErr } = await supabase
    .from("problem_attempts")
    .select("id, is_correct")
    .eq("problem_id", problemId)
    .eq("user_key", userKey)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (laErr) {
    return Response.json({ ok: false, error: laErr.message }, { status: 500 });
  }

  if (!lastAttempt || lastAttempt.is_correct !== true) {
    return Response.json(
      {
        ok: false,
        error: "you must solve the problem first (correct) before generating quiz",
        hint: "POST /api/problems/:id/attempt -> POST /api/problem_attempts/:attemptId/grade",
      },
      { status: 403 }
    );
  }

  //problems から ocr_text を取る
  const { data: problem, error: getErr } = await supabase
    .from("problems")
    .select("id, ocr_text")
    .eq("id", problemId)
    .single();

  if (getErr || !problem) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }

  const ocrText = String(problem.ocr_text ?? "").trim();
  if (!ocrText) {
    return Response.json(
      { ok: false, error: "ocr_text is empty. run /ocr first." },
      { status: 400 }
    );
  }

  //質問とrubric生成（今はダミー後で差し替え）
  const { question, rubric } = buildQuizFromOcr(ocrText);

  //quiz_itemsに保存
  const { data: quiz, error: insErr } = await supabase
    .from("quiz_items")
    .insert({ problem_id: problemId, question, rubric })
    .select("*")
    .single();

  if (insErr || !quiz) {
    return Response.json(
      { ok: false, error: insErr?.message ?? "failed to insert quiz" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, quiz });

  
}
