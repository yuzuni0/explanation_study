//問題のIdを指定して、そこからsupabaseDBに保存されている問題を取得するAPIを作る
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

//GETリクエストを受ける
export async function GET(
  _req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  //画像データをもとに作った問題のidを取り出す
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
//problemのテーブルからidに対応するものを取得
  const { data: problem, error } = await supabase
    .from("problems")
    .select("id, image_path, ocr_text, problem_statement, correct_answer, created_at")
    .eq("id", id)
    .single();
//見つからなかったら404を返す
  if (error || !problem) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }
//見つかればjsonを返す
  return Response.json({ ok: true, problem });
}