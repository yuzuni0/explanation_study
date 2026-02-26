"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type JsonRecord = Record<string, unknown>;

function isJsonRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "unknown error";
}

export default function DemoSetupPage() {
  const router = useRouter();

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [problemIdText, setProblemIdText] = useState("10");
  const [userId, setUserId] = useState("demo");
  const [busy, setBusy] = useState<"upload" | "load" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pid = Number(problemIdText);
  const uid = userId.trim() || "demo";

  async function uploadImageAndGo() {
    if (!uploadFile) {
      setError("画像を選んでください");
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);

      const res = await fetch("/api/upload-and-ocr", { method: "POST", body: fd });
      const json: unknown = await res.json();

      if (!res.ok || !isJsonRecord(json) || json.ok !== true) {
        throw new Error(
          isJsonRecord(json) && typeof json.error === "string"
            ? json.error
            : `HTTP ${res.status}`
        );
      }

      const newId = (json as JsonRecord).problemId as number;
      //メインページに遷移（problemId, userIdをクエリパラメータで渡す）
      router.push(`/demo?problemId=${newId}&userId=${encodeURIComponent(uid)}`);
    } catch (e: unknown) {
      setError(`Upload失敗: ${errMsg(e)}`);
      setBusy(null);
    }
  }

  async function loadProblemAndGo() {
    if (!Number.isFinite(pid)) {
      setError("problemId が不正です");
      return;
    }
    setBusy("load");
    setError(null);
    try {
      // 存在確認
      const res = await fetch(`/api/problems/${pid}`);
      const json: unknown = await res.json();

      if (!res.ok || !isJsonRecord(json) || json.ok !== true) {
        throw new Error(
          isJsonRecord(json) && typeof json.error === "string"
            ? json.error
            : `HTTP ${res.status}`
        );
      }

      // メインページに遷移
      router.push(`/demo?problemId=${pid}&userId=${encodeURIComponent(uid)}`);
    } catch (e: unknown) {
      setError(`Load失敗: ${errMsg(e)}`);
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Demo Setup</h1>

      <div style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 4 }}>
          problemId
          <input
            value={problemIdText}
            onChange={(e) => setProblemIdText(e.target.value)}
            style={{ padding: 12, border: "1px solid #ccc", borderRadius: 8, fontSize: 16 }}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          userId（未ログインなので demo でもOK）
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ padding: 12, border: "1px solid #ccc", borderRadius: 8, fontSize: 16 }}
          />
        </label>

        <hr style={{ margin: "8px 0" }} />

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>新しい問題をアップロード</div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={uploadImageAndGo}
            disabled={busy !== null}
            style={{
              padding: "12px 16px",
              fontSize: 16,
              cursor: busy ? "wait" : "pointer",
              background: "#0077ff",
              color: "#020202",
              border: "none",
              borderRadius: 8,
            }}
          >
            {busy === "upload" ? "アップロード中" : "Upload & OCR → デモへ"}
          </button>
        </div>

        <hr style={{ margin: "8px 0" }} />

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>既存の問題を読み込む</div>
          <button
            onClick={loadProblemAndGo}
            disabled={busy !== null}
            style={{
              padding: "12px 16px",
              fontSize: 16,
              cursor: busy ? "wait" : "pointer",
              background: "rgb(255, 0, 0)",
              color: "#000000",
              border: "none",
              borderRadius: 8,
            }}
          >
            {busy === "load" ? "読み込み中..." : "Load Problem → デモへ"}
          </button>
        </div>

        {error && (
          <div style={{ padding: 12, background: "rgb(255, 255, 255)", color: "rgb(0, 0, 0)", borderRadius: 8 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
