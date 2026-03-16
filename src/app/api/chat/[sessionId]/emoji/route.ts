//入力途中テキストを受け取り、構造分析に基づいて絵文字を返すAPI
//秒ごとにフロントエンドからポーリングされる想定

//フィードバック例
//🙂  問題無し — 手順・因果関係が整理され、指示語の参照先が明確
//🤔  前後のつながりが不明 — 情報はあるが接続が曖昧
//😕  説明不足 — 手順が一部欠落、前提・根拠が省略されている
//😑  無関係 — 説明に必要な要素がない（雑談等）
//🙂‍↕️ 納得 — 局所質問で指摘された不足点が補われ、構造が改善された

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
function isJsonRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractGeminiText(response: unknown): string {
  const r = response as Record<string, unknown>;
  if (typeof r.text === "string") return r.text;
  const cands = r.candidates as
    | { content?: { parts?: { text?: string }[] } }[]
    | undefined;
  return cands?.[0]?.content?.parts?.[0]?.text ?? "";
}

function extractJson(raw: string): string {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : raw;
}

/** 有効な絵文字のセット */
const VALID_EMOJIS = ["🙂", "🤔", "😕", "😑", "🙂‍↕️"] as const;
type EmojiType = (typeof VALID_EMOJIS)[number];

function isValidEmoji(s: string): s is EmojiType {
  return (VALID_EMOJIS as readonly string[]).includes(s);
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

  const text = String(body.text ?? "").trim();

  // テキストが空なら「😑 無関係」を即返す（API呼び出し不要）
  if (!text) {
    return Response.json({
      ok: true,
      emoji: "😑",
      label: "無関係",
      reason: "入力がありません",
    });
  }

  // ── Supabase からセッション情報を取得 ──
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: session, error: sessErr } = await supabase
    .from("chat_sessions")
    .select("id, problem_id, chat_step, next_question, state_json")
    .eq("id", sessionId)
    .single();

  if (sessErr || !session) {
    return Response.json({ ok: false, error: "session not found" }, { status: 404 });
  }

  //問題文・正解を取得
  const { data: problem } = await supabase
    .from("problems")
    .select("ocr_text, problem_statement, correct_answer")
    .eq("id", session.problem_id)
    .single();

  const problemText =
    problem?.ocr_text ?? problem?.problem_statement ?? "（問題文なし）";
  const correctAnswer = problem?.correct_answer ?? "（正解なし）";

  //直近の会話履歴（局所質問の指摘内容を把握するため）
  const { data: recentMessages } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(6);

  const recentHistory = (recentMessages ?? [])
    .reverse()
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n");

  //state_json から局所質問の現在の観点を取得
  const state = session.state_json as Record<string, unknown> | null;
  const localQuestions = (state?.local_questions ?? []) as {
    aspect?: string;
    description?: string;
    status?: string;
  }[];
  const currentIdx = (state?.current_local_index ?? 0) as number;
  const currentLQ = localQuestions[currentIdx];
  const currentAspect = currentLQ?.aspect ?? "";
  const currentDescription = currentLQ?.description ?? "";

  //Gemini API で絵文字判定
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    //API キーがない場合はフォールバック
    return Response.json({
      ok: true,
      emoji: "🤔",
      label: "前後のつながりが不明",
      reason: "API key unavailable, fallback",
    });
  }

  const genai = new GoogleGenAI({ apiKey });

  const emojiPrompt = `あなたは学習者の「入力途中のテキスト」を読み、説明の構造的な質を絵文字1つで表現する判定器です。

## 問題文
${problemText}

## 正解
${correctAnswer}

## 現在聞いている質問
${session.next_question ?? "（なし）"}

## 現在の観点
${currentAspect ? `${currentAspect}: ${currentDescription}` : "（全体質問中）"}

## 直近の会話
${recentHistory || "（なし）"}

## 学習者の入力途中テキスト
${text}

## 判定基準（この5つの中から使用者の説明が最も近いものを判別してください）

🙂 問題無し
  手順の流れや因果関係（例: だから・そのため）が整理されており、指示語の参照先が明確な状態。

🤔 前後のつながりが不明
  手順や値について十分な情報が含まれているが、前後の文を結ぶ接続が曖昧で、「なぜその操作をしたのか」「後の文にどう関係するのか」が読み取りにくい状態。

😕 説明不足
  手順が一部欠落している状態。「なぜそうなるのか」の根拠となる前提が省略されており、説明を追えない状態。

😑 無関係
  問題の説明として必要な要素が含まれておらず、判断材料が不足している状態（雑談等）。

🙂‍↕️ 納得
  直近の会話で指摘された不足点（前提・根拠・つながりなど）が補われ、説明の構造が改善された場合に選ぶ。※会話履歴で指摘がない場合は選ばない。

## 出力形式
余計な文章なし、次のJSONだけ返してください（Markdownの\`\`\`は禁止）：
{"emoji":"🙂","label":"問題無し","reason":"判定理由を1文で"}`;

  try {
    const resp = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: emojiPrompt,
    });

    const raw = extractGeminiText(resp);
    const parsed = JSON.parse(extractJson(raw)) as {
      emoji: string;
      label: string;
      reason: string;
    };

    //不正な絵文字が返された場合のガード
    const emoji = isValidEmoji(parsed.emoji) ? parsed.emoji : "🤔";

    return Response.json({
      ok: true,
      emoji,
      label: parsed.label ?? "",
      reason: parsed.reason ?? "",
    });
  } catch (err) {
    console.error("Emoji Gemini API failed:", err);

    // フォールバック: 簡易ルールベース判定
    const fallbackEmoji = fallbackEmojiRule(text);
    return Response.json({
      ok: true,
      emoji: fallbackEmoji.emoji,
      label: fallbackEmoji.label,
      reason: "Gemini API fallback",
    });
  }
}

//Gemini が使えないときの簡易的なルールベース
function fallbackEmojiRule(text: string): { emoji: EmojiType; label: string } {
  const t = text.trim();
  if (t.length < 5) return { emoji: "😑", label: "無関係" };

  const hasCausal = /だから|そのため|なぜなら|ので|ため|よって|したがって|つまり/.test(t);
  const hasStep = /まず|次に|最後に|そして|それから|その後/.test(t);
  const hasConclusion = /結論|結果|答え|なる|求める|得られる/.test(t);

  if (hasCausal && (hasStep || hasConclusion)) return { emoji: "🙂", label: "問題無し" };
  if (hasStep || hasConclusion) return { emoji: "🤔", label: "前後のつながりが不明" };
  if (t.length >= 10) return { emoji: "😕", label: "説明不足" };
  return { emoji: "😑", label: "無関係" };
}
