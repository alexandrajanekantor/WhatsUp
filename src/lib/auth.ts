import { createClient } from "./supabase/server";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export const unauthorized = () => Response.json({ error: "Please log in" }, { status: 401 });
