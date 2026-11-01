import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import SideNav from "@/components/ui/SideNav";

export const metadata: Metadata = {
  title: "benbadobee",
  description: "my life log",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <ConfirmProvider>
          {/* The navigation bar on the left of every page (not the login page). */}
          <Suspense fallback={null}>
            <SideNav />
          </Suspense>
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}
