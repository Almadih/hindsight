import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Hindsight Chess: Free Game Review for Chess.com & Lichess";
const description =
  "Enter your Chess.com or Lichess username and get every move rated, from brilliant to blunder, with the better move shown. Free, 60 reviews a day, no account.";

export const metadata: Metadata = {
  metadataBase: new URL("https://hindsight.almadih.dev"),
  title: { default: title, template: "%s · Hindsight Chess" },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Hindsight Chess", url: "/", title, description },
  twitter: { card: "summary_large_image" },
  authors: [{ name: "Almadih", url: "https://github.com/Almadih" }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script defer src="https://stats.almadih.dev/t.js" data-site="hindsight" />
      </body>
    </html>
  );
}
