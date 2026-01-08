import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Rubric = {
  score_range: "0-3";
  checks: string[];
};

//ダミーの質問
function buildQuizFromOcr(ocrText: string): { question: string; rubric: Rubric } {
  const question =
    "この問題の要点を1文で説明して（できれば「結論→理由」の順で）：\n\n" +
    `${ocrText}`;

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
  _req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {

  const { id: idStr } = await params;
  const problemId = Number(idStr);

  if (!Number.isFinite(problemId)) {
    return Response.json({ ok: false, error: "invalid id", debug: { idStr } }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

 //problemsからocr_textを取る
  const { data: problem, error: getErr } = await supabase
    .from("problems")
    .select("id, ocr_text")
    .eq("id", problemId)
    .single();

  if (getErr || !problem) {
    return Response.json({ ok: false, error: getErr?.message ?? "problem not found" }, { status: 404 });
  }

  const ocrText = (problem.ocr_text ?? "").trim();
  if (!ocrText) {
    return Response.json(
      { ok: false, error: "ocr_text is empty. run /api/problems/:id/ocr first." },
      { status: 400 }
    );
  }

 //質問＆rubric(だみー)生成
  const { question, rubric } = buildQuizFromOcr(ocrText);

 //quiz_itemsに保存
  const { data: quiz, error: insErr } = await supabase
    .from("quiz_items")
    .insert({ problem_id: problemId, question, rubric })
    .select("*")
    .single();

  if (insErr || !quiz) {
    return Response.json({ ok: false, error: insErr?.message ?? "failed to insert quiz" }, { status: 500 });
  }

  return Response.json({ ok: true, quiz });
}