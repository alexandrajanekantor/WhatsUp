import { redirect } from "next/navigation";
import { Suspense } from "react";
import HomeView from "@/components/HomeView";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VibeId } from "@/lib/vibes";

export const metadata = { title: "Home — WhatsUp" };

async function HomeLoader() {
  const user = await getUser();
  if (!user) redirect("/login");
  const { data: p } = await createAdminClient().from("profiles").select("*").eq("id", user.id).maybeSingle();
  const initial = p?.home_location
    ? { city: p.home_location as string, radiusKm: (p.default_radius_km as number) ?? 40, vibes: (p.default_vibes ?? []) as VibeId[] }
    : null;
  const name = (p?.display_name as string | undefined) ?? user.email?.split("@")[0] ?? "friend";
  return <HomeView initial={initial} name={name} />;
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeLoader />
    </Suspense>
  );
}
