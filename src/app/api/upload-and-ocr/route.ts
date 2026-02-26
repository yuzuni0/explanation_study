import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractCorrectAnswer } from "@/lib/extractCorrectAnswer";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

//画像パス（ローカルファイル）を tesseract CLI に渡して OCR する
async function runTesseractCli(imagePath: string, lang = "eng+jpn") {
  const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout", "-l", lang]);
  return (stdout ?? "").trim();
}

//画像アップロード → Storage保存 → DB保存 → OCR → ocr_text保存
export async function POST(req: Request) {
  //Supabaseクライアント作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  async function logOcr(params: {
    status: "success" | "empty" | "error";
    problemId?: number;
    imagePath?: string;
    error?: string;
    ocrText?: string;
  }) {
    const { status, problemId, imagePath, error, ocrText } = params;

    await supabase.from("problem_ocr_logs").insert({
      problem_id: problemId ?? null,
      image_path: imagePath ?? null,
      status,
      error: error ?? null,
      ocr_text_len: typeof ocrText === "string" ? ocrText.length : null,
      created_at: new Date().toISOString(),
    });
  }


  //フォームデータから画像ファイルを取得する
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  //Supabase Storageに画像をアップロード
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();

  //nodeのpathモジュールと名前が衝突するのでstoragePathにする
  const storagePath = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("problem-images")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ ok: false, step: "upload", error: uploadError.message }, { status: 500 });
  }

  //problemsテーブルにimage_pathを保存
  const { data: problem, error: insertError } = await supabase
    .from("problems")
    .insert({ image_path: storagePath })
    .select("id")
    .single();

  if (insertError || !problem) {
    return Response.json({ ok: false, step: "insert", error: insertError?.message ?? "insert failed" }, { status: 500 });
  }

  //OCR実行OSに入れたtesseract CLIを呼び出す
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "study-ai-ocr-"));
  const tmpPath = path.join(tmpDir, `img.${ext}`);

  let ocrText = "";
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    ocrText = await runTesseractCli(tmpPath, "eng+jpn");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    await logOcr({
      status: "error",
      problemId: problem.id,
      imagePath: storagePath,
      error: msg,
    });

    return Response.json({ ok: false, step: "ocr", error: msg }, { status: 500 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  // OCR結果が空白のみの場合は422エラー
  if (!ocrText || ocrText.trim().length === 0) {
    await logOcr({
      status: "empty",
      problemId: problem.id,
      imagePath: storagePath,
      error: "OCR result is empty or whitespace only",
      ocrText,
    });

    return Response.json(
      { ok: false, step: "ocr", error: "OCR result is empty or whitespace only" },
      { status: 422 }
    );
  }

  //ocr_textをDBに保存
  const { error: updateError } = await supabase
    .from("problems")
    .update({ ocr_text: ocrText })
    .eq("id", problem.id);

  if (updateError) {
    return Response.json({ ok: false, step: "update_ocr", error: updateError.message }, { status: 500 });
  }

  // Gemini APIでcorrect_answerを自動抽出
  let correctAnswer = "";
  try {
    correctAnswer = await extractCorrectAnswer(ocrText);
    if (correctAnswer) {
      await supabase
        .from("problems")
        .update({ correct_answer: correctAnswer })
        .eq("id", problem.id);
    }
  } catch (e: unknown) {
    console.error("extractCorrectAnswer failed (non-fatal):", e);
  }

  //成功ログした時のログ
  await logOcr({
    status: "success",
    problemId: problem.id,
    imagePath: storagePath,
    ocrText,
  });

  return Response.json({
    ok: true,
    problemId: problem.id,
    ocrText,
    correctAnswer,
  });
}