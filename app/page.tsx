import { dashboardPath, getCurrentProfile } from "@/lib/auth";
import { InstallLanding } from "@/components/install-landing";
import { HomeRedirect } from "@/components/home-redirect";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  // Client-side, so the dashboard is reached through the router instead of a
  // fresh browser navigation (which the navigation guard sends to /login).
  if (profile) return <HomeRedirect href={dashboardPath(profile.role)} />;
  // Logged-out visitor → show the PWA installation landing (already-installed
  // standalone users are redirected to /login client-side).
  return <InstallLanding />;
}
