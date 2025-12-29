"use client";

//
import { useState } from "react";

type UploadResult = {
  status: number;
  ok: boolean;
  bucket?: string;
  path?: string;
  problemId?: number;
  error?: string;
};

async function uploadFile(formData: FormData): Promise<UploadResult> {
  let res: Response;
  try {
    res = await fetch("/api/upload", { method: "POST", body: formData });
  } catch {
    return { status: 0, ok: false, error: "Network error (failed to reach server)" };
  }

  let json: Partial<Omit<UploadResult, "status">> = {};
  try {
    json = (await res.json()) as Partial<Omit<UploadResult, "status">>;
  } catch {
    return { status: res.status, ok: false, error: "Response was not JSON" };
  }

  const ok = typeof json.ok === "boolean" ? json.ok : res.ok;
  const error =
    typeof json.error === "string"
      ? json.error
      : !res.ok
        ? `Request failed with status ${res.status}`
        : undefined;

  return {
    status: res.status,
    ok,
    bucket: typeof json.bucket === "string" ? json.bucket : undefined,
    path: typeof json.path === "string" ? json.path : undefined,
    problemId: typeof json.problemId === "number" ? json.problemId : undefined,
    error,
  };
}

export default function UploadPage() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const res = await uploadFile(formData);

    setResult(res);
    setLoading(false);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Upload</h1>

      <form onSubmit={onSubmit}>
        <input name="file" type="file" accept="image/*" required />
        <button type="submit" disabled={loading} style={{ marginLeft: 12 }}>
          {loading ? "Uploading..." : "Upload"}
        </button>
      </form>

      <pre style={{ marginTop: 24, background: "#000000ff", color: "rgba(0, 255, 0, 1)", padding: 12 }}>
        {result ? JSON.stringify(result, null, 2) : "No result yet"}
      </pre>
    </main>
  );
}