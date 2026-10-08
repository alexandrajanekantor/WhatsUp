import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FavoritesProvider from "@/components/FavoritesProvider";
import Header from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WhatsUp — plan fun into your life",
  description: "Find events and activities that fit your vibe, wherever you are.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900"><Suspense fallback={<div className="h-[53px] border-b border-stone-200 bg-white" />}>
          <Header />
        </Suspense>
        <FavoritesProvider>{children}</FavoritesProvider>
      </body>
    </html>
  );
}
