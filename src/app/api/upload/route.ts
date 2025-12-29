import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1) multipart/form-data を読む
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  // 2) Storage に保存
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

  // 3) DB に1行追加（ここが今回の追加点）
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

  // 4) 返す（problemId を返す）
  return Response.json({ ok: true, bucket: "problem-images", path, problemId: data.id });
}