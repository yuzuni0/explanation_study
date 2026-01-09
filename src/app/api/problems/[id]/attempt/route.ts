//問題に対する回答problem_attemptを保存するAPI
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  //URLで使う問題のIDを取得し、それをproblemIdに変換する
  const { id: idStr } = await params;
  const problemId = Number(idStr);

  if (!Number.isFinite(problemId)) {
    return Response.json({ ok: false, error: "invalid problem id" }, { status: 400 });
  }
//JSONのbodyを読む
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  //jsonのbodyからanswerとuserKeyを取り出す
  const answer = String((body as { answer?: unknown }).answer ?? "").trim();
  const userKey = String((body as { userKey?: unknown }).userKey ?? "demo");

  if (!answer) {
    return Response.json({ ok: false, error: "answer is required" }, { status: 400 });
  }
//supabaseクライアントを管理者権限でつくる
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  //problemsが存在するかだけチェック
  const { data: p, error: pErr } = await supabase
    .from("problems")
    .select("id")
    .eq("id", problemId)
    .single();

  if (pErr || !p) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }

  //回答をproblem_attemptsに保存(採点はまだ)
  const { data: attempt, error: insErr } = await supabase
    .from("problem_attempts")
    .insert({
      problem_id: problemId,
      user_key: userKey,
      answer,
      is_correct: null,
      score: null,
      feedback: null,
    })
    .select("*")
    .single();

  if (insErr || !attempt) {
    return Response.json(
      { ok: false, error: insErr?.message ?? "failed to insert attempt" },
      { status: 500 }
    );
  }
//成功した際にはattemptの中身を全て返す
  return Response.json({ ok: true, attempt });
}