import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const name = (user?.user_metadata?.display_name as string | undefined) ?? user?.email?.split("@")[0];

  return (
    <header className="border-b border-stone-200 bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">WhatsUp</Link>
        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/home" className="hover:underline">Home</Link>
              <Link href="/favorites" className="hover:underline">Favorites</Link>
              <Link href="/history" className="hover:underline">History</Link>
              <span className="hidden text-stone-500 sm:inline">Hi, {name}</span>
              <form action="/api/auth/signout" method="post">
                <button className="text-violet-700 hover:underline">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">Log in</Link>
              <Link href="/signup" className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-700">Sign up</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
