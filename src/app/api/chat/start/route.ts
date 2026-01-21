//一つの会話の状態を管理するAPI
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
function isJsonRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (!isJsonRecord(body)) {
    return Response.json({ ok: false, error: "json must be object" }, { status: 400 });
  }

  const problemId = Number(body.problemId);
  const userId = String(body.userId ?? "").trim() || "demo";

  if (!Number.isFinite(problemId)) {
    return Response.json({ ok: false, error: "invalid problemId" }, { status: 400 });
  }
  //いつものSupabaseクライアント作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  //OCRをした問題がちゃんと正解済みかをチェック
  const { data: solved, error: sErr } = await supabase
    .from("problem_attempts")
    .select("id")
    .eq("problem_id", problemId)
    .eq("user_id", userId)
    .eq("is_correct", true)
    .limit(1)
    .maybeSingle();

  if (sErr) return Response.json({ ok: false, error: sErr.message }, { status: 500 });

  if (!solved) {
    return Response.json(
      { ok: false, error: "solve the problem first (correct) to start chat" },
      { status: 403 }
    );
  }

  //質問フェーズにいつでも戻れるように既存のsessionがあれば再開できるようにする
  const { data: existing, error: eErr } = await supabase
    .from("chat_sessions")
    .select("id, next_question, chat_step, status, latest_score")
    .eq("problem_id", problemId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (eErr) return Response.json({ ok: false, error: eErr.message }, { status: 500 });

  if (existing) {
    return Response.json({
      ok: true,
      sessionId: existing.id,
      next_question: existing.next_question,
      session: existing,
      resumed: true,
    });
  }

  //質最初のnext_questionを作成する
  const firstQuestion =
    "まず、この問題の要点を1文で説明して（できれば「結論→理由」の順で）。";

  const nowIso = new Date().toISOString();
  //chat_sessionにinsertする
  const { data: session, error: insErr } = await supabase
    .from("chat_sessions")
    .insert({
      problem_id: problemId,
      user_id: userId,
      status: "active",
      chat_step: "summary",
      next_question: firstQuestion,
      latest_score: null,
      state_json: { turn: 0, streak3: 0 },
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id, next_question, chat_step, status, latest_score")
    .single();

  if (insErr || !session) {
    return Response.json({ ok: false, error: insErr?.message ?? "failed to create session" }, { status: 500 });
  }

  //chat_messagesにassistantの一通目をinsertする
  await supabase.from("chat_messages").insert({
    session_id: session.id,
    role: "assistant",
    content: firstQuestion,
    chat_step_at_time: "summary",
  });
  //レスポンスをjsonで返す
  return Response.json({
    ok: true,
    sessionId: session.id,
    next_question: session.next_question,
    session,
    resumed: false,
  });
}