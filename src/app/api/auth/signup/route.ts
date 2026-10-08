import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().max(60).optional(),
});

// Email confirmation is intentionally skipped for now: the user is created already-confirmed
// via the admin API, then signed in. Revisit before launch (enable confirmation in Supabase).
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { email, password, displayName } = parsed.data;

  const { error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return Response.json(
      { error: exists ? "An account with that email already exists. Try logging in." : error.message },
      { status: exists ? 409 : 400 },
    );
  }

  const supabase = await createClient();
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error) return Response.json({ error: signIn.error.message }, { status: 500 });
  return Response.json({ ok: true });
}
