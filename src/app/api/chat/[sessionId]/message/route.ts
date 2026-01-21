//chat_sessionにメッセージを送る、送られた説明を採点する、次の質問を決めるAPI(quizフォルダと被るけど一旦無視)
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Rubric = { checks: string[] };

function hasAny(a: string, re: RegExp) {
  return re.test(a);
}

function gradeSummary(answer: string, rubric: Rubric) {
  const a = answer.trim();
  const missing: string[] = [];

  const ok_topic = a.length >= 5;
  const ok_conclusion = hasAny(a, /結論|つまり|要するに|なる|求める/);
  const ok_reason = hasAny(a, /理由|なぜなら|だから|ので|ため|よって|結果|合計|和|足す|加える/);
  const ok_one_sentence = !hasAny(a, /\n/) && a.length <= 160;

  const checksResult: [string, boolean][] = [
    [rubric.checks?.[0] ?? "要点", ok_topic],
    [rubric.checks?.[1] ?? "結論", ok_conclusion],
    [rubric.checks?.[2] ?? "理由", ok_reason],
    [rubric.checks?.[3] ?? "1文", ok_one_sentence],
  ];

  for (const [label, passed] of checksResult) if (!passed) missing.push(label);
//スコアをつける
  const passedCount = checksResult.filter(([, p]) => p).length;
  let score = 0;
  if (passedCount >= 1) score = 1;
  if (passedCount >= 2) score = 2;
  if (passedCount >= 3) score = 3;

  const feedback =
    score === 3
      ? "OK：要点→結論→理由の流れが見えます。"
      : score === 2
      ? `あと少し：不足(${missing.join(" / ")})を補うと満点に近いです。`
      : score === 1
      ? `最低限は書けていますが、不足(${missing.join(" / ")})があります。`
      : `ほぼ未回答です。不足(${missing.join(" / ")})を意識して1文で書いてみてください。`;

  return { score, feedback, missing_items: missing };
}

function buildNextQuestion(step: string, missing: string[]) {
  //stepがsummaryの時には質問を固定する(最初の質問)
  if (step !== "summary") {
    return "次に、解き方を『まず→次に→最後』で短く箇条書きにして書いてください。";
  }

  if (missing.length === 0) {
    return "OK。次に、解き方を『まず→次に→最後』で短く箇条書きにして書いてください。";
  }

  const top = missing[0];
  if (top.includes("要点")) return "この問題は『何を求める/何をする問題』？結論だけ1文で。";
  if (top.includes("結論")) return "結論を先に：最終的に何がどうなる？（例：〜になる / 〜を求める）";
  if (top.includes("理由")) return "理由を一言足して：なぜその結論になる？（なぜなら〜）";
  if (top.includes("1文")) return "改行なしで1文に圧縮して書き直してみて。";
  return `不足(${top})を補う形で、もう一度短く書いてください。`;
}

type JsonRecord = Record<string, unknown>;
function isJsonRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function POST(
  req: Request,
  { params }: { params: { sessionId: string } | Promise<{ sessionId: string }> }
) {
  const { sessionId: sStr } = await params;
  const sessionId = Number(sStr);
  if (!Number.isFinite(sessionId)) {
    return Response.json({ ok: false, error: "invalid sessionId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!isJsonRecord(body)) {
    return Response.json({ ok: false, error: "json must be object" }, { status: 400 });
  }

  const userText = String(body.userText ?? "").trim();
  if (!userText) {
    return Response.json({ ok: false, error: "userText is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  //chat_sessionsを取得し、中にある情報を取り出す
  const { data: session, error: sessErr } = await supabase
    .from("chat_sessions")
    .select("id, problem_id, user_id, status, chat_step, next_question, state_json")
    .eq("id", sessionId)
    .single();

  if (sessErr || !session) return Response.json({ ok: false, error: "session not found" }, { status: 404 });
  if (session.status !== "active") return Response.json({ ok: false, error: "session is not active" }, { status: 409 });

  //userの説明をchat_messagesにinsert
  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: userText,
    chat_step_at_time: session.chat_step,
  });

  //採点を基準を確認し、説明などをまとめて採点する
  const rubric: Rubric = { checks: ["要点", "結論", "理由", "1文"] };
  const result = gradeSummary(userText, rubric);

  const nextQuestion = buildNextQuestion(session.chat_step, result.missing_items);

  //sessionを更新
  const state = (session.state_json ?? {}) as { turn?: number; streak3?: number };
  const turn = (state.turn ?? 0) + 1;
  const streak3 = result.score === 3 ? (state.streak3 ?? 0) + 1 : 0;

  //終了条件を設定する(今回は最高点の3点を2回連続で撮ることが条件)
  const done = session.chat_step === "summary" && streak3 >= 2 && result.missing_items.length === 0;

  const nowIso = new Date().toISOString();
  const { data: updatedSession, error: upSessErr } = await supabase
    .from("chat_sessions")
    .update({
      latest_score: result.score,
      next_question: done ? "OK。最後に、解き方の全体手順を1回でまとめて書いてください。" : nextQuestion,
      status: done ? "done" : "active",
      updated_at: nowIso,
      state_json: { ...state, turn, streak3 },
    })
    .eq("id", sessionId)
    .select("id, status, chat_step, next_question, latest_score, state_json")
    .single();

  if (upSessErr || !updatedSession) {
    return Response.json({ ok: false, error: upSessErr?.message ?? "failed to update session" }, { status: 500 });
  }

  //assistantの説明をchat_messagesにinsertする
  const assistantText =
    `${result.feedback}\n\n` + (updatedSession.next_question ?? nextQuestion);

  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: assistantText,
    chat_step_at_time: session.chat_step,
    score: result.score,
    missing_items: result.missing_items,
  });
//いつも通りjsonで返す
  return Response.json({
    ok: true,
    session: updatedSession,
    grade: result,
    assistant: { content: assistantText, next_question: updatedSession.next_question },
  });
}