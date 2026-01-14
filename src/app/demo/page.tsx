"use client";

import React, { useMemo, useState } from "react";

//デモ用の型定義

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
  user_key: string;
  answer: string;
  is_correct: boolean | null;
  score: number | null;
  feedback: string | null;
  created_at: string;
  graded_at?: string | null;
};

type QuizItem = {
  id: number;
  problem_id: number;
  question: string;
  rubric: unknown; //デモ段階のため構造は簡素に
  created_at: string;
};

type QuizAttempt = {
  id: number;
  quiz_id: number;
  answer: string;
  score: number | null;
  feedback: string | null;
  created_at: string;
};

type ProblemGradeResponse = {
  ok: true;
  canProceed: boolean;
  problem: { id: number; problem_statement: string | null };
  attempt: ProblemAttempt;
};

type QuizGradeResponse = {
  ok: true;
  attempt: QuizAttempt;
  missing_items: string[];
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
//{ok:false,error:"..."}みたいに実行できなかったらエラーを投げる
//guard(型チェック)に通ったら T を返す
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

  //まず{ok:false,error:"..."}をとる。ステータスが200でもエラーになりうる
  if (isJsonRecord(json) && json.ok === false && typeof json.error === "string") {
    throw new Error(json.error);
  }

  //HTTPが失敗した上で、上記の形でもない場合は先に進まない
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

function guardPatchProblem(x: unknown): x is { ok: true; problem: Problem } {
  return guardGetProblem(x);
}

function guardCreateProblemAttempt(x: unknown): x is { ok: true; attempt: ProblemAttempt } {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  const a = (x as JsonRecord).attempt;
  if (!isJsonRecord(a)) return false;
  return typeof a.id === "number" && typeof a.problem_id === "number";
}

function guardProblemGrade(x: unknown): x is ProblemGradeResponse {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  return typeof (x as JsonRecord).canProceed === "boolean";
}

function guardGenerateQuiz(x: unknown): x is { ok: true; quiz: QuizItem } {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  const q = (x as JsonRecord).quiz;
  if (!isJsonRecord(q)) return false;
  return typeof q.id === "number" && typeof q.problem_id === "number";
}

function guardCreateQuizAttempt(x: unknown): x is { ok: true; attempt: QuizAttempt } {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  const a = (x as JsonRecord).attempt;
  if (!isJsonRecord(a)) return false;
  return typeof a.id === "number" && typeof a.quiz_id === "number";
}

function guardQuizGrade(x: unknown): x is QuizGradeResponse {
  if (!isJsonRecord(x)) return false;
  if (x.ok !== true) return false;
  return "attempt" in x;
}

/** ========== Page ========== */

type BusyKey =
  | null
  | "loadProblem"
  | "saveProblem"
  | "createProblemAttempt"
  | "gradeProblemAttempt"
  | "generateQuiz"
  | "createQuizAttempt"
  | "gradeQuizAttempt";

export default function DemoPage() {
  // 入力ほぼ一覧
  const [problemIdText, setProblemIdText] = useState("10");
  const pid = useMemo(() => Number(problemIdText), [problemIdText]);

  const [userKey, setUserKey] = useState("demo");

  const [ocrText, setOcrText] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");

  const [answer, setAnswer] = useState("");
  const [quizAnswer, setQuizAnswer] = useState("");

  //取得データほぼ一覧
  const [problem, setProblem] = useState<Problem | null>(null);
  const [problemAttempt, setProblemAttempt] = useState<ProblemAttempt | null>(null);
  const [problemGrade, setProblemGrade] = useState<ProblemGradeResponse | null>(null);

  const [quiz, setQuiz] = useState<QuizItem | null>(null);
  const [quizAttempt, setQuizAttempt] = useState<QuizAttempt | null>(null);
  const [quizGrade, setQuizGrade] = useState<QuizGradeResponse | null>(null);

  const [busy, setBusy] = useState<BusyKey>(null);
  const [logs, setLogs] = useState<string[]>([]);

  function pushLog(s: string) {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${s}`, ...prev].slice(0, 50));
  }

  //asyncの関数群

  async function loadProblem() {
    if (!Number.isFinite(pid)) return pushLog("problemId が不正です");
    setBusy("loadProblem");
    try {
      const data = await apiFetch(`/api/problems/${pid}`, undefined, guardGetProblem);
      setProblem(data.problem);
      setOcrText(String(data.problem.ocr_text ?? ""));
      setProblemStatement(String(data.problem.problem_statement ?? ""));
      setCorrectAnswer(String(data.problem.correct_answer ?? ""));
      pushLog(`GET /api/problems/${pid} OK`);
    } catch (e: unknown) {
      pushLog(`GET problem NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveProblem() {
    if (!Number.isFinite(pid)) return pushLog("problemId が不正です");
    setBusy("saveProblem");
    try {
      const body: Record<string, unknown> = {};
      if (ocrText !== "") body.ocr_text = ocrText;
      if (problemStatement !== "") body.problem_statement = problemStatement;
      if (correctAnswer !== "") body.correct_answer = correctAnswer;

      const data = await apiFetch(
        `/api/problems/${pid}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        guardPatchProblem
      );

      setProblem(data.problem);
      pushLog(`PATCH /api/problems/${pid} OK`);
    } catch (e: unknown) {
      pushLog(`PATCH problem NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function createProblemAttempt() {
    if (!Number.isFinite(pid)) return pushLog("problemId が不正です");
    setBusy("createProblemAttempt");
    try {
      const data = await apiFetch(
        `/api/problems/${pid}/attempt`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answer, userKey: userKey.trim() || "demo" }),
        },
        guardCreateProblemAttempt
      );

      setProblemAttempt(data.attempt);
      setProblemGrade(null);
      setQuiz(null);
      setQuizAttempt(null);
      setQuizGrade(null);
      pushLog(`POST /api/problems/${pid}/attempt OK (attemptId=${data.attempt.id})`);
    } catch (e: unknown) {
      pushLog(`POST attempt NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function gradeProblemAttempt() {
    const attemptId = Number(problemAttempt?.id);
    if (!Number.isFinite(attemptId)) return pushLog("attemptId がありません（先にAttempt作成）");
    setBusy("gradeProblemAttempt");
    try {
      const data = await apiFetch(
        `/api/problem_attempts/${attemptId}/grade`,
        { method: "POST" },
        guardProblemGrade
      );

      setProblemGrade(data);
      pushLog(`POST /api/problem_attempts/${attemptId}/grade OK (canProceed=${data.canProceed})`);
    } catch (e: unknown) {
      pushLog(`grade problem NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function generateQuiz() {
    if (!Number.isFinite(pid)) return pushLog("problemId が不正です");
    setBusy("generateQuiz");
    try {
      const data = await apiFetch(
        `/api/problems/${pid}/quiz`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userKey: userKey.trim() || "demo" }),
        },
        guardGenerateQuiz
      );

      setQuiz(data.quiz);
      setQuizAttempt(null);
      setQuizGrade(null);
      pushLog(`POST /api/problems/${pid}/quiz OK (quizId=${data.quiz.id})`);
    } catch (e: unknown) {
      pushLog(`generate quiz NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function createQuizAttempt() {
    const quizId = Number(quiz?.id);
    if (!Number.isFinite(quizId)) return pushLog("quizId がありません（先にQuiz生成）");
    setBusy("createQuizAttempt");
    try {
      const data = await apiFetch(
        `/api/quiz/${quizId}/attempt`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answer: quizAnswer }),
        },
        guardCreateQuizAttempt
      );

      setQuizAttempt(data.attempt);
      setQuizGrade(null);
      pushLog(`POST /api/quiz/${quizId}/attempt OK (quizAttemptId=${data.attempt.id})`);
    } catch (e: unknown) {
      pushLog(`quiz attempt NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function gradeQuizAttempt() {
    const qaId = Number(quizAttempt?.id);
    if (!Number.isFinite(qaId)) return pushLog("quizAttemptId がありません（先にQuiz回答）");
    setBusy("gradeQuizAttempt");
    try {
      const data = await apiFetch(
        `/api/quiz_attempts/${qaId}/grade`,
        { method: "POST" },
        guardQuizGrade
      );

      setQuizGrade(data);
      pushLog(`POST /api/quiz_attempts/${qaId}/grade OK (score=${data.attempt.score})`);
    } catch (e: unknown) {
      pushLog(`grade quiz NG: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const canProceed = problemGrade?.canProceed === true;

  //インターフェイス

  const disabled = (k: BusyKey) => busy !== null && busy !== k;

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Demo Flow</h1>

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <label style={{ display: "grid", gap: 4 }}>
          problemId
          <input
            value={problemIdText}
            onChange={(e) => setProblemIdText(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          userKey（未ログインなので demo でもOK）
          <input
            value={userKey}
            onChange={(e) => setUserKey(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={loadProblem}
          disabled={disabled("loadProblem")}
          style={{ padding: "8px 12px" }}
        >
          1 Load Problem (GET)
        </button>
        <button
          onClick={saveProblem}
          disabled={disabled("saveProblem")}
          style={{ padding: "8px 12px" }}
        >
          2) Save Problem (PATCH)
        </button>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        ocr_text（今は手入力）
        <textarea
          value={ocrText}
          onChange={(e) => setOcrText(e.target.value)}
          rows={4}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
        />
      </label>

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <label style={{ display: "grid", gap: 4 }}>
          problem_statement（任意）
          <input
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          correct_answer（ダミーなので手入力）
          <input
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>
      </div>

      <hr />

      <label style={{ display: "grid", gap: 4 }}>
        answer（問題の最終解答）
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={createProblemAttempt}
          disabled={disabled("createProblemAttempt")}
          style={{ padding: "8px 12px" }}
        >
          3 Create Attempt
        </button>
        <button
          onClick={gradeProblemAttempt}
          disabled={disabled("gradeProblemAttempt")}
          style={{ padding: "8px 12px" }}
        >
          4 Grade Attempt
        </button>
      </div>

      <div>
        <div>canProceed: {String(canProceed)}</div>
        {problemGrade?.attempt?.feedback ? (
          <div>feedback: {problemGrade.attempt.feedback}</div>
        ) : null}
      </div>

      <hr />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={generateQuiz}
          disabled={!canProceed || disabled("generateQuiz")}
          style={{ padding: "8px 12px" }}
          title={!canProceed ? "正解してから" : ""}
        >
          5 Generate Quiz（正解後）
        </button>
      </div>

      {quiz ? (
        <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Quiz</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{quiz.question}</div>
        </div>
      ) : null}

      <label style={{ display: "grid", gap: 4 }}>
        quizAnswer
        <input
          value={quizAnswer}
          onChange={(e) => setQuizAnswer(e.target.value)}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
          disabled={!quiz}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={createQuizAttempt}
          disabled={!quiz || disabled("createQuizAttempt")}
          style={{ padding: "8px 12px" }}
        >
          6 Save Quiz Answer
        </button>
        <button
          onClick={gradeQuizAttempt}
          disabled={!quizAttempt || disabled("gradeQuizAttempt")}
          style={{ padding: "8px 12px" }}
        >
          7 Grade Quiz Answer
        </button>
      </div>

      {quizGrade ? (
        <div>
          <div>quiz score: {String(quizGrade.attempt.score)}</div>
          <div>quiz feedback: {String(quizGrade.attempt.feedback)}</div>
        </div>
      ) : null}

      <hr />

      <details>
        <summary>Debug state</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(
            { problem, problemAttempt, problemGrade, quiz, quizAttempt, quizGrade, busy },
            null,
            2
          )}
        </pre>
      </details>

      <details open>
        <summary>Logs</summary>
        <ul>
          {logs.map((l, i) => (
            <li key={i} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {l}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}