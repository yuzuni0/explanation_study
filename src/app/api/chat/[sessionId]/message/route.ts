//chat_sessionにメッセージを送る、送られた説明を採点する、次の質問を決めるAPI(quizフォルダと被るけど一旦無視した)
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

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
    console.log("chat message body =", body);
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!isJsonRecord(body)) {
    return Response.json({ ok: false, error: "json must be object" }, { status: 400 });
  }

  const raw = body.userText ?? body.content;
  const userText = String(raw ?? "").trim();

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

  //problemsテーブルから問題文と正解を取得
  const { data: problem, error: probErr } = await supabase
    .from("problems")
    .select("id, ocr_text, problem_statement, correct_answer")
    .eq("id", session.problem_id)
    .single();

  if (probErr || !problem) {
    return Response.json({ ok: false, error: "problem not found" }, { status: 404 });
  }

  const problemText = problem.ocr_text ?? problem.problem_statement ?? "（問題文なし）";
  const correctAnswer = problem.correct_answer ?? "（正解なし）";

  //過去の会話履歴を取得（重複質問を防ぐため）
  const { data: pastMessages } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20); // 直近20件まで

  const conversationHistory = (pastMessages ?? [])
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  //userの説明をchat_messagesにinsert
  const { error: insUserErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: userText,
    chat_step_at_time: session.chat_step,
  });
  if (insUserErr) {
    return Response.json({ ok: false, error: `failed to insert user message: ${insUserErr.message}` }, { status: 500 });
  }


  //採点を基準を確認し、説明などをまとめて採点する
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY) is not set" },
      { status: 500 }
    );
  }

  const genai = new GoogleGenAI({ apiKey });

  const gradePrompt = `あなたは使用者が解いた問題の説明を受ける聞き手です。
何も知らない聞き手として使用者の問題に対する「説明」を読み、採点し,次に聞くべき“1つの質問”をあなた自身の言葉で作ってください。
問題文
${problemText}

正解
${correctAnswer}

これまでの会話履歴
${conversationHistory || "（なし）"}

今回の学生の説明
${userText}

採点方法
今回の質問（または会話の流れ）が「要点」「結論」「理由」のどれを聞いているかを判断し、
その[1つの観点だけ]で以下の基準で採点してください：

評価観点の定義:
- 要点: 何の問題か/何を求めるかが言えているか
- 結論: 最終的に何を出す/何がどうなるか、が明確か
- 理由: なぜその結論/手順になるのか（根拠・理由）があるか

スコア（0〜3点）の基準:
- 0点: 該当観点について全く言及していない、または的外れ
- 1点: 該当観点に触れているが、曖昧で不十分
- 2点: 該当観点を説明しているが、もう少し具体性や深さが欲しい
- 3点: 該当観点について明確で十分な説明ができている

現在のチャットステップ
${session.chat_step}

next_question の条件
- “固定テンプレ”を選ばない。あなた自身の文章で作る。
- 質問は1つだけ（最も重要な不足を埋める質問）。
- 学生の説明の一部を短く引用して、どこが曖昧か具体的に指摘してから質問する。
- 長さは1文。日本語。
- その問題の解き方や定義などについて深掘りする。
- **会話履歴を確認し、すでに聞いた質問や類似の質問は絶対に繰り返さない。**
- **過去に学生が回答済みの内容について再度聞かない。**
- 説明が十分に伝わらず、同じ点について深掘りしたい際は「よくわからなかった」と言う。
- 質問は3~5度程度する。質問が終わったら終了の合図を出す。

- stepがsummary以外なら「手順（まず→次に→最後）」に寄せた質問にする（ただし固定文は禁止）。
- 説明が十分であると判断したら最後に手順寄せた質問をする
出力形式
余計な文章を付けず、必ず次のJSONだけを返してください（Markdownの\`\`\`は禁止）：
{"score":0,
 "evaluated_aspect":"要点 or 結論 or 理由",
 "feedback":"",
 "next_question":""}`
    ;

  let result: { score: number; feedback: string; evaluated_aspect: string };
  let nextQuestion: string;

  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: gradePrompt,
    });

    const text =
      (response as unknown as { text?: string }).text ??
      (response as unknown as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      }).candidates?.[0]?.content?.parts?.[0]?.text ??
      "";

    console.log("Gemini response:", text);
    //JSONを抜き出す
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const gradeResult = JSON.parse(jsonStr) as {
      score: number;
      feedback: string;
      evaluated_aspect: string;
      next_question: string;
    };

    result = {
      score: Math.max(0, Math.min(3, gradeResult.score)),
      feedback: gradeResult.feedback,
      evaluated_aspect: gradeResult.evaluated_aspect ?? "不明",
    };
    nextQuestion = gradeResult.next_question;
  } catch (error) {
    console.error("Gemini", error);
    //Gemini APIが失敗した場合は従来のロジック採点にする
    const rubric: Rubric = { checks: ["要点", "結論", "理由", "1文"] };
    const fallback = gradeSummary(userText, rubric);
    result = {
      score: fallback.score,
      feedback: fallback.feedback,
      evaluated_aspect: "フォールバック",
    };
    nextQuestion = buildNextQuestion(session.chat_step, fallback.missing_items);
  }

  //sessionを更新
  const state = (session.state_json ?? {}) as { turn?: number; streak3?: number };
  const turn = (state.turn ?? 0) + 1;
  const streak3 = result.score === 3 ? (state.streak3 ?? 0) + 1 : 0;

  //終了条件を設定する(今は最高点の3点を2回連続で取ること)
  const done = session.chat_step === "summary" && streak3 >= 2;

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

  //assistantの説明をchat_messagesにinsertする (エラーチェック付き)
  const assistantText =
    `${result.feedback}\n\n` + (updatedSession.next_question ?? nextQuestion);

  const { error: insAsstErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: assistantText,
    chat_step_at_time: session.chat_step,
    score: result.score,
    evaluated_aspect: result.evaluated_aspect,
  });
  if (insAsstErr) {
    return Response.json({ ok: false, error: `failed to insert assistant message: ${insAsstErr.message}` }, { status: 500 });
  }
  //いつも通りjsonで返す
  return Response.json({
    ok: true,
    session: updatedSession,
    grade: result,
    //assistantのメッセージとかnext_questionも返しておく
    assistant_message: { role: "assistant", content: assistantText },
    next_question: String(updatedSession.next_question ?? nextQuestion ?? ""),
    //互換のために残す
    assistant: { content: assistantText, next_question: updatedSession.next_question },
  });
}