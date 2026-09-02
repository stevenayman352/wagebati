import { redirect } from "next/navigation";
import { dashboardPath, getCurrentProfile } from "@/lib/auth";
import { InstallLanding } from "@/components/install-landing";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (profile) redirect(dashboardPath(profile.role));
  // Logged-out visitor → show the PWA installation landing (already-installed
  // standalone users are redirected to /login client-side).
  return <InstallLanding />;
}
