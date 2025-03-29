import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NextAuthProvider } from "@/app/providers";
import Navbar from "@/components/Navbar";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Art Gallery",
  description: "A beautiful art gallery showcasing various artworks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <NextAuthProvider>
          <Navbar />
          <main>{children}</main>
          <Toaster />
        </NextAuthProvider>
      </body>
    </html>
  );
}
