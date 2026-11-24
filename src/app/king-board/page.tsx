import type { Metadata } from "next";
import KingBoard from "@/components/king/KingBoard";

export const metadata: Metadata = { title: "Arrivals · TravelPass", robots: { index: false, follow: false } };

export default function KingBoardPage() {
  return <KingBoard />;
}
