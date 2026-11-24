import type { Metadata } from "next";
import FlipBoard from "@/components/board/FlipBoard";

export const metadata: Metadata = { title: "Arrivals · TravelPass" };

export default function BoardPage() {
  return <FlipBoard />;
}
