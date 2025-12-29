import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // 1) multipart/form-data のチェック（curl事故防止）
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return Response.json(
      { ok: false, error: "multipart/form-data required" },
      { status: 415 }
    );
  }

  // 2) FormData を読む
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { ok: false, error: "failed to parse formData" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  // 3) Supabase Admin Client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 4) Storage にアップロード
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("problem-images")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  // 5) DBに problems を作成（image_path を保存）
  const { data, error: insertError } = await supabase
    .from("problems")
    .insert({ image_path: path })
    .select("id")
    .single();

  if (insertError || !data) {
    return Response.json(
      { ok: false, error: insertError?.message ?? "failed to insert problem" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, bucket: "problem-images", path, problemId: data.id });
}