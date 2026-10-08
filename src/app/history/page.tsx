import { redirect } from "next/navigation";
import { Suspense } from "react";
import HistoryView from "@/components/HistoryView";
import { getUser } from "@/lib/auth";

async function Guarded() {
  if (!(await getUser())) redirect("/login");
  return <HistoryView />;
}

export default function Page() {
  return (
    <Suspense>
      <Guarded />
    </Suspense>
  );
}
