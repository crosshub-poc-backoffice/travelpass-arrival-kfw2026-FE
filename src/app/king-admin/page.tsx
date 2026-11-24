import type { Metadata } from "next";
import KingAdmin from "@/components/king/KingAdmin";

export const metadata: Metadata = { title: "시연 진행", robots: { index: false, follow: false } };

export default function KingAdminPage() {
  return (
    <main className="page plain">
      <KingAdmin />
    </main>
  );
}
