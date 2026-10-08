import { Suspense } from "react";
import SearchApp from "@/components/SearchApp";

export default function Home() {
  // Default dates depend on "now", so the form renders per request instead of being prerendered.
  return (
    <Suspense>
      <SearchApp />
    </Suspense>
  );
}
