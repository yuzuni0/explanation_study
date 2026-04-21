import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = { strokes?: unknown; userId?: unknown;};



//URLのIDが正しいかを、数値に変換して確認する
export async function POST(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  //IDを数値に変換して確認する
  const { id: idStr } = await params;
  const problemId = Number(idStr);

  //URLのID(中身はproblem_id)が数値でない場合に400エラーを返す
  if (!Number.isFinite(problemId)) {
    return Response.json({ ok: false, error: "invalid problem id" }, { status: 400 });
  }

  //strokesのデータをプログラムで扱えるように変換する
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    //変換に失敗したらエラー
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  //strokesが配列ではない時にエラーを返す。(複数のストロークの配列だから)
  const strokes = body.strokes;
  if (!Array.isArray(strokes)) {
    return Response.json({ ok: false, error: "strokes is required" }, { status: 400 });
  }
  const userId = String(body.userId ?? "").trim() || "demo";

  //データベース操作のsupabaseクライアント作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  //problemsにproblemIdが存在するかを確認
  const { data: quiz, error: qErr } = await supabase
    .from("problems")
    .select("id")
    .eq("id", problemId)
    .single();

  if (qErr || !quiz) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }

  //attemptをinsert(テーブルについか)して保存する
  const { data: attempt, error: insErr } = await supabase
    .from("problem_strokes")
    .insert({ problem_id: problemId, strokes, user_id: userId })
    .select("*")
    .single();
  //insertに失敗したら500エラーを返す
  if (insErr || !attempt) {
    return Response.json(
      { ok: false, error: insErr?.message ?? "failed to insert attempt" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, attempt });
}