import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import AccountFooter from "@/components/AccountFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Studio",
  description: "Personal content analytics dashboard",
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-text min-h-screen">
        <AppShell accountFooter={<AccountFooter />}>{children}</AppShell>
      </body>
    </html>
  );
}
