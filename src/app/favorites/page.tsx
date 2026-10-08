import { redirect } from "next/navigation";
import { Suspense } from "react";
import FavoritesView from "@/components/FavoritesView";
import { getUser } from "@/lib/auth";

async function Guarded() {
  if (!(await getUser())) redirect("/login");
  return <FavoritesView />;
}

export default function Page() {
  return (
    <Suspense>
      <Guarded />
    </Suspense>
  );
}
