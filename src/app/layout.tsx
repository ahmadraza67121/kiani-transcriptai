import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kiani TranscriptAI — YouTube Transcript Extractor & Translator",
  description:
    "Kiani TranscriptAI - Extract complete transcripts from any YouTube video and translate them into 24+ languages including Urdu, Hindi, Arabic, Roman Urdu, Hinglish and more. Install as desktop app!",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kiani TranscriptAI",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Kiani TranscriptAI — YouTube Transcript Extractor",
    description: "Extract, Translate & Rewrite YouTube transcripts in 24+ languages",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ef4444",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Kiani TranscriptAI" />
        <meta name="apple-mobile-web-app-title" content="Kiani TranscriptAI" />
        <meta name="msapplication-TileColor" content="#ef4444" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
