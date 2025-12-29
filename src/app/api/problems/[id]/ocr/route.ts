import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id: idStr } = await params;

  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return Response.json(
      { ok: false, error: "invalid id", debug: { idStr } },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: problem, error: getErr } = await supabase
    .from("problems")
    .select("id, image_path")
    .eq("id", id)
    .single();

  if (getErr || !problem) {
    return Response.json(
      { ok: false, error: getErr?.message ?? "problem not found" },
      { status: 404 }
    );
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from("problem-images")
    .download(problem.image_path);

  if (dlErr || !blob) {
    return Response.json(
      { ok: false, error: dlErr?.message ?? "download failed" },
      { status: 500 }
    );
  }

  const text =
  `DUMMY_OCR\n` +
  `problem_id=${id}\n` +
  `image_path=${problem.image_path}\n` +
  `timestamp=${new Date().toISOString()}`;

  const { error: upErr } = await supabase
    .from("problems")
    .update({ ocr_text: text })
    .eq("id", id);

  if (upErr) {
    return Response.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, id, ocr_text: text });
}
