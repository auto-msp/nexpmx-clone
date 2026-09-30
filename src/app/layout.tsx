import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BizMemory — Business Memory Platform",
    template: "%s | BizMemory",
  },
  description:
    "BizMemory keeps clients, projects, documents, decisions and invoices connected — so your team and your AI both work from the same memory.",
  openGraph: {
    title: "BizMemory — Business Memory Platform",
    description:
      "Clients, projects, documents, decisions and invoices in one connected memory your team and your AI can both work from.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
