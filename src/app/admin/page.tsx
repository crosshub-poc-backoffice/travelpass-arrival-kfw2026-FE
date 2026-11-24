import type { Metadata } from "next";
import AdminConsole from "@/components/admin/AdminConsole";

export const metadata: Metadata = { title: "운영 콘솔 · TravelPass Arrival", robots: { index: false } };

export default function AdminPage() {
  return (
    <main className="page plain">
      <AdminConsole />
    </main>
  );
}
