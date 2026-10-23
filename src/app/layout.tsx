import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime request to Google.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-source-serif",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${sourceSerif.variable}`}
    >
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
