import { createClient } from "@supabase/supabase-js";
import Tesseract from "tesseract.js";

export const runtime = "nodejs";

/**
 * POST /api/:id/ocr
 * problemsテーブルのidから画像パスを取り出し → Storageから画像をダウンロード → OCR → ocr_textに保存
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  // Next.js 15+ ではparamsがPromiseになる可能性があるためawait
  const { id: idStr } = await params;

  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return Response.json(
      { ok: false, error: "invalid id", debug: { idStr } },
      { status: 400 }
    );
  }

  // Supabaseクライアント作成（サービスロールキーを使用）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. problemsテーブルからidに対応するレコードを取得
  const { data: problem, error: getErr } = await supabase
    .from("problems")
    .select("id, image_path")
    .eq("id", id)
    .single();

  if (getErr || !problem) {
    return Response.json(
      { ok: false, error: getErr?.message ?? "problem not found" },
      { status: 404 }
    );
  }

  // 2. Storageから画像をダウンロード
  const { data: blob, error: dlErr } = await supabase.storage
    .from("problem-images")
    .download(problem.image_path);

  if (dlErr || !blob) {
    return Response.json(
      { ok: false, error: dlErr?.message ?? "download failed" },
      { status: 500 }
    );
  }

  // 3. OCR実行（Tesseract.js）
  const buffer = Buffer.from(await blob.arrayBuffer());
  const { data: ocr } = await Tesseract.recognize(buffer, "eng+jpn");
  const text = (ocr.text ?? "").trim();

  // 4. ocr_textに保存
  const { error: upErr } = await supabase
    .from("problems")
    .update({ ocr_text: text })
    .eq("id", id);

  if (upErr) {
    return Response.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, id, ocr_text: text });
}
