"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { WhatsUpEvent } from "@/lib/types";

interface FavoritesContextValue {
  isFavorite: (id: string) => boolean;
  toggle: (event: WhatsUpEvent) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue>({ isFavorite: () => false, toggle: async () => {} });
export const useFavorites = () => useContext(FavoritesContext);

export default function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/favorites?ids=1")
      .then(async (res) => {
        if (!res.ok) return; // 401 when logged out
        const { ids } = (await res.json()) as { ids: string[] };
        setIds(new Set(ids));
        setLoggedIn(true);
      })
      .catch(() => {});
  }, []);

  const toggle = useCallback(
    async (event: WhatsUpEvent) => {
      if (!loggedIn) {
        router.push("/login");
        return;
      }
      const adding = !ids.has(event.id);
      const apply = (add: boolean) =>
        setIds((prev) => {
          const next = new Set(prev);
          if (add) next.add(event.id);
          else next.delete(event.id);
          return next;
        });
      apply(adding); // optimistic
      const res = adding
        ? await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event }),
          })
        : await fetch(`/api/favorites?id=${encodeURIComponent(event.id)}`, { method: "DELETE" });
      if (!res.ok) apply(!adding); // roll back
    },
    [ids, loggedIn, router],
  );

  const value = useMemo(() => ({ isFavorite: (id: string) => ids.has(id), toggle }), [ids, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
