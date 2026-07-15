import type { Metadata } from "next";
import { DM_Sans, Syne, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const dm = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TideDesk — OANDA AI Forex",
  description: "AI-assisted forex trading desk connected to OANDA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dm.variable} ${syne.variable} ${plex.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
