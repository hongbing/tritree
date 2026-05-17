import { redirect } from "next/navigation";

import { WorkManagementPanel } from "@/components/works/WorkManagementPanel";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function WorksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <WorkManagementPanel />;
}
