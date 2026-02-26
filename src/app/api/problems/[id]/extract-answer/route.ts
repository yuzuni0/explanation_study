import { createClient } from "@supabase/supabase-js";
import { extractCorrectAnswer } from "@/lib/extractCorrectAnswer";

export const runtime = "nodejs";

/**
 * POST /api/problems/[id]/extract-answer
 * ocr_text から Gemini API で correct_answer を抽出し、DBに保存する。
 * body に { ocrText: string } を渡すとそのテキストで抽出する（省略時はDBのocr_textを使う）。
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return Response.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // bodyからocrTextを取得（省略時はDBから読む）
  let ocrText: string | undefined;
  try {
    const body = (await req.json()) as { ocrText?: string };
    ocrText = typeof body.ocrText === "string" ? body.ocrText : undefined;
  } catch {
    // bodyが空でもOK
  }

  if (!ocrText) {
    const { data: problem, error } = await supabase
      .from("problems")
      .select("ocr_text")
      .eq("id", id)
      .single();

    if (error || !problem) {
      return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
    }
    ocrText = String(problem.ocr_text ?? "");
  }

  if (!ocrText.trim()) {
    return Response.json({ ok: false, error: "ocr_text is empty" }, { status: 422 });
  }

  // Gemini APIで正解を抽出
  const correctAnswer = await extractCorrectAnswer(ocrText);

  if (!correctAnswer) {
    return Response.json({
      ok: true,
      correctAnswer: "",
      message: "correct_answer could not be extracted",
    });
  }

  // DBに保存
  const { error: updateError } = await supabase
    .from("problems")
    .update({ correct_answer: correctAnswer })
    .eq("id", id);

  if (updateError) {
    return Response.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return Response.json({ ok: true, correctAnswer });
}
