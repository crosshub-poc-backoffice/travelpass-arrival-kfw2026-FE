import type { Metadata } from "next";
import Results from "@/components/Results";

export const metadata: Metadata = { title: "Winning numbers · TravelPass Arrival" };

export default function ResultsPage() {
  return (
    <main className="page plain">
      <Results />
    </main>
  );
}
