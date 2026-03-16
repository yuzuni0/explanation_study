"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

//型定義

type Problem = {
  id: number;
  image_path: string | null;
  ocr_text: string | null;
  problem_statement: string | null;
  correct_answer: string | null;
  concepts?: string[] | null;
  created_at: string;
};

type ProblemAttempt = {
  id: number;
  problem_id: number;
  user_id: string;
  answer: string;
  is_correct: boolean | null;
  score: number | null;
  feedback: string | null;
  created_at: string;
  graded_at?: string | null;
};

type ProblemGradeResponse = {
  ok: true;
  canProceed: boolean;
  problem: { id: number; problem_statement: string | null };
  attempt: ProblemAttempt;
};

//汎用型のチェック
type JsonRecord = Record<string, unknown>;

function isJsonRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "unknown error";
}


//API共通でfetch
//JSONをunknownで受けとる
//型チェックを通ったらT型を返す
async function apiFetch<T>(
  url: string,
  init?: RequestInit,
  guard?: (x: unknown) => x is T
): Promise<T> {
  const res = await fetch(url, init);

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`JSON parse failed (status=${res.status})`);
  }

  //ステータスが成功でも表情変化が失敗したらエラーを投げる。表情変化の失敗を(ok:false,error:"理由")の形で返す
  if (isJsonRecord(json) && json.ok === false && typeof json.error === "string") {
    throw new Error(json.error);
  }

  //HTTPが失敗した上で、上記の形でもない場合は先に進まない。ok:falseじゃない普通の奴もエラーにする
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  if (guard && !guard(json)) {
    throw new Error("Response shape mismatch");
  }

  return json as T;
}

//型ガードの関数群
function guardGetProblem(x: unknown): x is { ok: true; problem: Problem } {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  if (!("problem" in x)) return false;
  const p = (x as JsonRecord).problem;
  if (!isJsonRecord(p)) return false;
  return typeof p.id === "number";
}

function guardCreateProblemAttempt(x: unknown): x is { ok: true; attempt: ProblemAttempt } {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  const a = (x as JsonRecord).attempt;
  if (!isJsonRecord(a)) return false;
  return (
    typeof a.id === "number" &&
    typeof a.problem_id === "number" &&
    typeof a.user_id === "string"
  );
}

function guardPatchProblemAttempt(x: unknown): x is { ok: true; attempt: ProblemAttempt } {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  const a = (x as JsonRecord).attempt;
  if (!isJsonRecord(a)) return false;
  return (
    typeof a.id === "number" &&
    typeof a.problem_id === "number" &&
    typeof a.user_id === "string"
  );
}

function guardProblemGrade(x: unknown): x is ProblemGradeResponse {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  return typeof (x as JsonRecord).canProceed === "boolean";
}

//質問フェーズ用の型ガードを追加した
type ChatStartResponse = {
  ok: true;
  sessionId: number;
  next_question: string;
  session: {
    id: number;
    next_question: string | null;
    chat_step: string;
    status: string;
    latest_score: number | null;
  };
  resumed: boolean;
};


type ChatSendResponse = {
  ok: true;
  session?: { id?: string; next_question?: string | null };
  assistant_message?: { role?: string; content?: string };
  next_question?: string | null;
};


function guardChatStart(x: unknown): x is ChatStartResponse {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;

  const session = (x as JsonRecord).session;
  if (!isJsonRecord(session)) return false;

  return (
    typeof (x as JsonRecord).sessionId === "number" &&
    typeof (x as JsonRecord).next_question === "string" &&
    typeof (session as JsonRecord).id === "number"
  );
}

function guardChatSend(x: unknown): x is ChatSendResponse {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  return true;
}

//Page

type BusyKey =
  | null
  | "saveProblem"
  | "submitAnswer"
  | "chatStart"
  | "chatSend";

export default function DemoPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URLパラメータから取得
  const problemIdParam = searchParams.get("problemId");
  const userIdParam = searchParams.get("userId");

  const pid = useMemo(() => Number(problemIdParam), [problemIdParam]);
  const uid = userIdParam?.trim() || "demo";

  // URLパラメータがない場合はsetupページへリダイレクト
  useEffect(() => {
    if (!problemIdParam) {
      router.replace("/demo/setup");
    }
  }, [problemIdParam, router]);

  const [ocrText, setOcrText] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");

  const [answer, setAnswer] = useState("");


  //取得データ一覧
  const [problem, setProblem] = useState<Problem | null>(null);
  const [problemAttempt, setProblemAttempt] = useState<ProblemAttempt | null>(null);
  const [problemGrade, setProblemGrade] = useState<ProblemGradeResponse | null>(null);

  const [busy, setBusy] = useState<BusyKey>(null);
  const [, setLogs] = useState<string[]>([]);

  //質問フェーズようのuseStateを追加
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLog, setChatLog] = useState<{ role: string; content: string }[]>([]);
  const [, setChatNextQuestion] = useState<string>("");

  //絵文字リアクション機能
  const [reactionEmoji, setReactionEmoji] = useState<string>("😑");
  const [reactionLabel, setReactionLabel] = useState<string>("入力待ち");
  const [reactionReason, setReactionReason] = useState<string>("");
  const emojiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEmojiTextRef = useRef<string>("");

  //絵文字APIを呼ぶ関数
  const fetchEmoji = useCallback(async (text: string, sid: number) => {
    // 前回と同じテキストならスキップ
    if (text === lastEmojiTextRef.current) return;
    lastEmojiTextRef.current = text;

    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(sid)}/emoji`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json() as { ok: boolean; emoji?: string; label?: string; reason?: string };
      if (data.ok && data.emoji) {
        setReactionEmoji(data.emoji);
        setReactionLabel(data.label ?? "");
        setReactionReason(data.reason ?? "");
      }
    } catch {
      //ネットワークエラーなどは黙殺（次回リトライ）
    }
  }, []);

  //Chat Start 時に3秒ポーリング開始、セッション終了/アンマウント時にクリア
  useEffect(() => {
    if (!chatSessionId) {
      //セッションがない → ポーリング停止
      if (emojiTimerRef.current) {
        clearInterval(emojiTimerRef.current);
        emojiTimerRef.current = null;
      }
      return;
    }

    // 3秒ごとにポーリング
    emojiTimerRef.current = setInterval(() => {
      const currentText = (document.querySelector("textarea[data-emoji-target]") as HTMLTextAreaElement | null)?.value ?? "";
      fetchEmoji(currentText, chatSessionId);
    }, 3000);

    return () => {
      if (emojiTimerRef.current) {
        clearInterval(emojiTimerRef.current);
        emojiTimerRef.current = null;
      }
    };
  }, [chatSessionId, fetchEmoji]);


  function pushLog(s: string) {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${s}`, ...prev].slice(0, 50));
  }

  // 初回読み込み
  useEffect(() => {
    if (!Number.isFinite(pid) || pid <= 0) return;

    async function loadProblem() {
      try {
        const data = await apiFetch(`/api/problems/${pid}`, undefined, guardGetProblem);
        setProblem(data.problem);
        setOcrText(String(data.problem.ocr_text ?? ""));
        setProblemStatement(String(data.problem.problem_statement ?? ""));
        setCorrectAnswer(String(data.problem.correct_answer ?? ""));
        pushLog(`GET /api/problems/${pid} OK`);

        // correct_answer が空で ocr_text がある場合、自動抽出する
        if (!data.problem.correct_answer && data.problem.ocr_text) {
          pushLog("correct_answer が未設定のため自動抽出中...");
          try {
            const extractRes = await fetch(`/api/problems/${pid}/extract-answer`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ocrText: data.problem.ocr_text }),
            });
            const extractData = await extractRes.json() as { ok: boolean; correctAnswer?: string };
            if (extractData.ok && extractData.correctAnswer) {
              setCorrectAnswer(extractData.correctAnswer);
              pushLog(`correct_answer を自動抽出: "${extractData.correctAnswer}"`);
            } else {
              pushLog("correct_answer の自動抽出: 結果なし");
            }
          } catch (e: unknown) {
            pushLog(`correct_answer 自動抽出 NG: ${errMsg(e)}`);
          }
        }
      } catch (e: unknown) {
        pushLog(`GET problem NG: ${errMsg(e)}`);
      }
    }

    loadProblem();
  }, [pid]);

  // Enterキーでproblemを保存
  async function saveProblem() {
    if (!Number.isFinite(pid)) return pushLog("problemId が不正です");
    setBusy("saveProblem");
    try {
      const body: Record<string, unknown> = {};
      if (ocrText !== "") body.ocr_text = ocrText;
      if (problemStatement !== "") body.problem_statement = problemStatement;
      if (correctAnswer !== "") body.correct_answer = correctAnswer;

      const res = await fetch(`/api/problems/${pid}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.problem) {
        setProblem(data.problem);
      }
      pushLog(`PATCH /api/problems/${pid} OK`);

      //ocr_text が変更されていた場合、Gemini API で correct_answer を自動再抽出
      if (body.ocr_text && ocrText !== (problem?.ocr_text ?? "")) {
        pushLog("ocr_text が変更されたため correct_answer を自動抽出中...");
        try {
          const extractRes = await fetch(`/api/problems/${pid}/extract-answer`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ocrText }),
          });
          const extractData = await extractRes.json() as { ok: boolean; correctAnswer?: string };
          if (extractData.ok && extractData.correctAnswer) {
            setCorrectAnswer(extractData.correctAnswer);
            pushLog(`correct_answer を自動抽出: "${extractData.correctAnswer}"`);
          } else {
            pushLog("correct_answer の自動抽出: 結果なし");
          }
        } catch (e: unknown) {
          pushLog(`correct_answer 自動抽出 NG: ${errMsg(e)}`);
        }
      }
    } catch (e: unknown) {
      pushLog(`PATCH problem NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function createProblemAttempt() {
    if (!Number.isFinite(pid)) return null;
    try {
      const data = await apiFetch(
        `/api/problems/${pid}/attempt`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answer, userId: uid }),
        },
        guardCreateProblemAttempt
      );

      setProblemAttempt(data.attempt);
      setProblemGrade(null);
      pushLog(`POST /api/problems/${pid}/attempt OK (attemptId=${data.attempt.id})`);
      return data.attempt;
    } catch (e: unknown) {
      pushLog(`POST attempt NG: ${errMsg(e)}`);
      return null;
    }
  }

  async function updateProblemAttempt(attemptId: number) {
    try {
      const data = await apiFetch(
        `/api/problem_attempts/${attemptId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answer }),
        },
        guardPatchProblemAttempt
      );

      setProblemAttempt(data.attempt);
      setProblemGrade(null);
      pushLog(`PATCH /api/problem_attempts/${attemptId} OK (answer updated)`);
      return data.attempt;
    } catch (e: unknown) {
      pushLog(`PATCH attempt NG: ${errMsg(e)}`);
      return null;
    }
  }

  async function gradeProblemAttempt(attemptId: number) {
    try {
      const data = await apiFetch(
        `/api/problem_attempts/${attemptId}/grade`,
        { method: "POST" },
        guardProblemGrade
      );

      setProblemGrade(data);
      pushLog(`POST /api/problem_attempts/${attemptId}/grade OK (canProceed=${data.canProceed})`);
      return data;
    } catch (e: unknown) {
      pushLog(`grade problem NG: ${errMsg(e)}`);
      return null;
    }
  }

  // Enterで回答を送信・採点する統合関数
  async function submitAnswer() {
    if (!Number.isFinite(pid)) return pushLog("problemId が不正です");
    if (!answer.trim()) return pushLog("answer が空です");

    setBusy("submitAnswer");
    try {
      let attempt = problemAttempt;

      // attemptがなければ作成、あれば更新
      if (!attempt) {
        attempt = await createProblemAttempt();
      } else {
        attempt = await updateProblemAttempt(attempt.id);
      }

      if (!attempt) {
        pushLog("attempt の作成/更新に失敗しました");
        return;
      }

      // 採点
      await gradeProblemAttempt(attempt.id);
    } finally {
      setBusy(null);
    }
  }

  async function chatStart() {
    if (!Number.isFinite(pid)) return pushLog("problemId が不正です");
    setBusy("chatStart");
    try {
      const data = await apiFetch(
        "/api/chat/start",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ problemId: pid, userId: uid }),
        },
        guardChatStart
      );

      setChatSessionId(data.sessionId);
      const q = String(data.next_question ?? data.session.next_question ?? "");
      setChatNextQuestion(q);
      setChatLog(q ? [{ role: "assistant", content: q }] : []);
      setChatNextQuestion(q);
      setChatLog(q ? [{ role: "assistant", content: q }] : []);

      pushLog(`CHAT START OK (sessionId=${data.session.id})`);
    } catch (e: unknown) {
      pushLog(`CHAT START NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }
  //質問フェーズようのasync関数を追加
  async function chatSend() {
    const sid = chatSessionId;
    if (!sid) return pushLog("chatSessionId がありません（先にChat Start）");
    const content = chatInput.trim();
    if (!content) return pushLog("送信内容が空です");

    setBusy("chatSend");
    try {
      const data = await apiFetch(
        `/api/chat/${encodeURIComponent(sid)}/message`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userText: content }),
        },
        guardChatSend
      );

      // 送信したuser文をログへ
      setChatLog((prev) => [...prev, { role: "user", content }]);

      // 返ってきた次の質問（assistant）をログへ
      const nextQ =
        String(data.next_question ?? data.session?.next_question ?? data.assistant_message?.content ?? "");

      if (nextQ) {
        setChatLog((prev) => [...prev, { role: "assistant", content: nextQ }]);
        setChatNextQuestion(nextQ);
      }

      setChatInput("");
      pushLog("CHAT SEND OK");
    } catch (e: unknown) {
      pushLog(`CHAT SEND NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const canProceed = problemGrade?.canProceed === true;

  //インターフェイス

  const disabled = (k: BusyKey) => busy !== null && busy !== k;

  // URLパラメータがない場合は何も表示しない（リダイレクト中）
  if (!problemIdParam) {
    return <div style={{ padding: 16 }}>リダイレクト中...</div>;
  }

  return (
    <div style={{ padding: 16, height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {pid}番目(problem_id)の問題
        </h1>
        <button
          onClick={() => router.push("/demo/setup")}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          ← OCRの問題選択画面に戻る
        </button>
      </div>

      {/* メイン2カラムレイアウト */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 0, flex: 1, minHeight: 0 }}>

        {/* 左側：質問フェーズ */}
        <div style={{ display: "flex", flexDirection: "column", padding: 12, border: "1px solid #ccc", borderRadius: 8, minHeight: 0, overflow: "hidden" }}>
          <div style={{ fontWeight: 700, marginBottom: 8, flexShrink: 0 }}>質問フェーズ</div>

          {/* 絵文字リアクション枠 */}
          {chatSessionId && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                marginBottom: 10,
                borderRadius: 12,
                background: "linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)",
                border: "1px solid #c4d7f2",
                flexShrink: 0,
                transition: "all 0.3s ease",
              }}
            >
              <span
                style={{
                  fontSize: 40,
                  lineHeight: 1,
                  transition: "transform 0.3s ease",
                  display: "inline-block",
                }}
                title={reactionReason}
              >
                {reactionEmoji}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#333" }}>
                  フィードバック
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {reactionLabel}
                </div>
              </div>
            </div>
          )}

          {/*Chat log（上部）*/}
          <div style={{ flex: 1, overflowY: "auto", marginBottom: 12, padding: 8, border: "1px solid #eee", borderRadius: 8, minHeight: 0, background: "#fafafa" }}>
            {chatLog.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {chatLog.map((m, i) => (
                  <div key={i}>
                    <b>{m.role}:</b> <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#999" }}>チャット履歴を表示する</div>
            )}
          </div>

          {/* chat input */}
          <label style={{ display: "grid", gap: 4, marginBottom: 8, flexShrink: 0 }}>
            説明を入力してください
            <textarea
              data-emoji-target
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  chatSend();
                }
              }}
              rows={3}
              style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8, resize: "vertical" }}
              disabled={!chatSessionId}
              placeholder="Ctrl+Enterで送信"
            />
          </label>

          {/*Sendボタン(下部)*/}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={chatStart}
              disabled={!canProceed || disabled("chatStart")}
              style={{ padding: "8px 12px", flex: 1 }}
              title={!canProceed ? "正解してから" : ""}
            >
              Chat Start
            </button>
            <button
              onClick={chatSend}
              disabled={!chatSessionId || disabled("chatSend")}
              style={{ padding: "8px 12px", flex: 1 }}
            >
              Send
            </button>
          </div>
        </div>


        {/*問題編集・回答フェーズ*/}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0, overflow: "hidden" }}>

          {/* 問題（質問フェーズ上部） */}
          <div style={{ flexShrink: 0, padding: 12, borderBottom: "1px solid #ccc" }}>

            <textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  saveProblem();
                }
              }}
              rows={6}
              style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 8, resize: "vertical", fontSize: 14 }}
              placeholder="OCRテキスト（Ctrl+Enterで保存）"
            />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
              <label style={{ display: "grid", gap: 4 }}>
                正解値(correct_answer)
                <input
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      saveProblem();
                    }
                  }}
                  style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
                  placeholder="Enterで保存"
                />
              </label>
            </div>
          </div>

          {/* 途中式・メモ（質問フェーズ中央）*/}
          <div style={{ flex: 1, padding: 12, borderBottom: "1px solid #ccc", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ fontWeight: 700, marginBottom: 8, flexShrink: 0 }}>途中式、メモなどの自由記述欄</div>
            <div style={{ flex: 1, overflowY: "auto", border: "1px dashed #ccc", borderRadius: 8, padding: 8, background: "#fafafa" }}>
              未実装,タッチペンで描けるようにしたい
            </div>
          </div>

          {/* answer入力(質問フェーズ下)*/}
          <div style={{ padding: 12, flexShrink: 0 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 700 }}>問題に対する回答(answer)</span>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submitAnswer();
                  }
                }}
                disabled={busy === "submitAnswer"}
                style={{ padding: 12, border: "2px solid #333", borderRadius: 8, fontSize: 16 }}
                placeholder="Enterで採点"
              />
            </label>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontWeight: 700 }}>正誤判定: </span>
              <span style={{ color: canProceed ? "green" : "red" }}>{String(canProceed)}</span>
              {problemGrade?.attempt?.feedback && (
                <div style={{ marginTop: 4, color: "#666" }}>feedback: {problemGrade.attempt.feedback}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}