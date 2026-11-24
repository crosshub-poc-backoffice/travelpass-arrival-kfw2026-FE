import type { Metadata } from "next";
import KingPhone from "@/components/king/KingPhone";

export const metadata: Metadata = { title: "TravelPass Arrival", robots: { index: false, follow: false } };

export default function KingPage() {
  return (
    <main className="page plain">
      <KingPhone />
    </main>
  );
}
