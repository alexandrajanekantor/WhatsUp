"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isSignup = mode === "signup";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignup) {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, displayName: displayName || undefined }),
        });
        if (!res.ok) {
          setError((await res.json().catch(() => null))?.error ?? "Sign up failed");
          return;
        }
      } else {
        const { error } = await createClient().auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
          return;
        }
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="mb-6 text-center text-2xl font-bold">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        {isSignup && (
          <label className="block text-sm font-medium">
            Name (optional)
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" className={input} />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={input} />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password" required minLength={isSignup ? 8 : undefined} value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? "new-password" : "current-password"} className={input}
          />
          {isSignup && <span className="text-xs text-stone-500">At least 8 characters.</span>}
        </label>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        <button disabled={loading} className="w-full rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
          {loading ? "One moment…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-600">
        {isSignup ? (
          <>Already have an account? <Link href="/login" className="text-violet-700 hover:underline">Log in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="text-violet-700 hover:underline">Create an account</Link></>
        )}
      </p>
    </div>
  );
}
