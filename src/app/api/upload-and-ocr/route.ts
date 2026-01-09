import { createClient } from "@supabase/supabase-js";
import Tesseract from "tesseract.js";

export const runtime = "nodejs";

// 画像アップロード → Storage保存 → DB保存 → OCR → ocr_text保存

export async function POST(req: Request) {
  // Supabaseクライアント作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. フォームデータから画像ファイルを取得
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "file is required" },
      { status: 400 }
    );
  }

  // 2. Supabase Storageに画像をアップロード
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("problem-images")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return Response.json(
      { ok: false, step: "upload", error: uploadError.message },
      { status: 500 }
    );
  }

  // 3. problemsテーブルにimage_pathを保存
  const { data: problem, error: insertError } = await supabase
    .from("problems")
    .insert({ image_path: path })
    .select("id")
    .single();

  if (insertError) {
    return Response.json(
      { ok: false, step: "insert", error: insertError.message },
      { status: 500 }
    );
  }

  // 4. OCR実行（アップロードしたファイルを直接使用）
  const buffer = Buffer.from(await file.arrayBuffer());
  const { data: ocr } = await Tesseract.recognize(buffer, "eng+jpn");
  const ocrText = (ocr.text ?? "").trim();

  // 5. ocr_textをDBに保存
  const { error: updateError } = await supabase
    .from("problems")
    .update({ ocr_text: ocrText })
    .eq("id", problem.id);

  if (updateError) {
    return Response.json(
      { ok: false, step: "update_ocr", error: updateError.message },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    problemId: problem.id,
    imagePath: path,
    ocrText: ocrText,
    message: "画像アップロード・DB保存・OCR・テキスト保存が完了しました",
  });
}
