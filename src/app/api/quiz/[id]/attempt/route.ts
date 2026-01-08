import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = { answer?: string };

export async function POST(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const quizId = Number(idStr);

  if (!Number.isFinite(quizId)) {
    return Response.json({ ok: false, error: "invalid quiz id" }, { status: 400 });
  }

//JSONのbodyを読む
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const answer = (body.answer ?? "").trim();
  if (!answer) {
    return Response.json({ ok: false, error: "answer is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

//quiz_itemにquizIdが存在するかを確認
  const { data: quiz, error: qErr } = await supabase
    .from("quiz_items")
    .select("id")
    .eq("id", quizId)
    .single();

  if (qErr || !quiz) {
    return Response.json({ ok: false, error: "quiz not found" }, { status: 404 });
  }

//attemptをinsertして保存する(保存はしない)
  const { data: attempt, error: insErr } = await supabase
    .from("quiz_attempts")
    .insert({ quiz_id: quizId, answer })
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