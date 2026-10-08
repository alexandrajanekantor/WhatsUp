import { getUser, unauthorized } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const { data, error } = await createAdminClient()
    .from("searches")
    .select("id, location_text, radius_km, start_date, end_date, filters, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ searches: data });
}

export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  const db = createAdminClient();
  const q = db.from("searches").delete().eq("user_id", user.id);
  const { error } = await (id ? q.eq("id", id) : q); // no id = clear all
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
