import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { NavigationLoading } from "@/components/navigation-loading";
import { Cairo, Amiri } from "next/font/google";
import { cn } from "@/lib/utils";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-cairo"
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri"
});

export const metadata: Metadata = {
  title: "واجباتي",
  description: "برنامج استلام واجبات الحان مدرسة الشمامسة",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/image.png", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }]
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "واجباتي" }
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cn("font-sans", cairo.variable, amiri.variable)}>
      <body>
        <PwaRegister />
        <Suspense fallback={null}>
          <NavigationLoading />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
