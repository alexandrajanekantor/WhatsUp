import { Suspense } from "react";
import SearchApp from "@/components/SearchApp";
import { aiEnabled } from "@/lib/ai-config";

export default function Home() {
  // Default dates depend on "now", so the form renders per request instead of being prerendered.
  return (
    <Suspense>
      <SearchApp aiEnabled={aiEnabled()} />
    </Suspense>
  );
}
