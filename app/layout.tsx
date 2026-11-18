import type { Metadata } from "next";
import localFont from "next/font/local";
import AnalyticsConsent from "@/app/components/AnalyticsConsent";
import "./globals.css";

const plexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin-variable.woff2",
  variable: "--font-plex-sans",
  weight: "100 700",
  style: "normal",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FlipOS | Fix & Flip Deal Analyzer",
  description: "Analyze fix-and-flip deals: cost stack, ROI, 70% rule, and net profit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <noscript>
          <p className="bg-slate-900 p-4 text-base text-slate-100">
            FlipOS needs JavaScript to calculate and save deals. Enable JavaScript and reload. No sign-in is required.
          </p>
        </noscript>
        {children}
        <AnalyticsConsent />
      </body>
    </html>
  );
}
