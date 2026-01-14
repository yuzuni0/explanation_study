//問題のIdを指定して、そこからsupabaseDBに保存されている問題を取得するAPIを作る
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  //画像データをもとに問題のIDを取り出す
  const { id: idStr } = await params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return Response.json({ ok: false, error: "invalid id" }, { status: 400 });
  }
//supabaseクライアントの作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
//ploblemテーブルからidに対応するものを取得する
  const { data: problem, error } = await supabase
    .from("problems")
    .select("id, image_path, ocr_text, problem_statement, correct_answer, concepts, created_at")
    .eq("id", id)
    .single();

  if (error || !problem) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }
//idが見つかればjsonを返す
  return Response.json({ ok: true, problem });
}

//ploblemsの中に行があるか、正しい形式か、更新できているかを確認する
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return Response.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const payload = body as {
    problem_statement?: unknown;
    ocr_text?: unknown;
    correct_answer?: unknown;
    concepts?: unknown;
  };

  //更新用のオブジェクト
  const update: Record<string, unknown> = {};

  if (payload.problem_statement !== undefined) update.problem_statement = String(payload.problem_statement);
  if (payload.ocr_text !== undefined) update.ocr_text = String(payload.ocr_text);
  if (payload.correct_answer !== undefined) update.correct_answer = String(payload.correct_answer);

  //問題の単元などを分ける際にconceptsでダグ付けをする
  if (payload.concepts !== undefined) {
    if (!Array.isArray(payload.concepts) || !payload.concepts.every((x) => typeof x === "string")) {
      return Response.json({ ok: false, error: "concepts must be string[]" }, { status: 400 });
    }
    update.concepts = payload.concepts;
  }
//更新できない場合は400エラー
  if (Object.keys(update).length === 0) {
    return Response.json({ ok: false, error: "no fields to update" }, { status: 400 });
  }
//supabaseクライアントを作る
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
//更新したい項目を指定し、idに当たるものを更新する
  const { data: updated, error } = await supabase
    .from("problems")
    .update(update)
    .eq("id", id)
    .select("id, image_path, ocr_text, problem_statement, correct_answer, concepts, created_at")
    .single();

  if (error || !updated) {
    return Response.json({ ok: false, error: error?.message ?? "failed to update" }, { status: 500 });
  }

  return Response.json({ ok: true, problem: updated });
}