import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import Header from "@/components/Header";
import { NostrProvider } from "@/contexts/NostrContext";
import { BlogProvider } from "@/contexts/BlogContext";
import { NostrLoginProvider } from "@/components/NostrLoginProvider";
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export const metadata: Metadata = {
  title: "Longform._",
  description: "A focused space for Nostr longform.",
  icons: {
    icon: '/images/long-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={inter.className}>
        <NostrProvider>
          <BlogProvider>
            <GlobalErrorHandler />
            <NostrLoginProvider />
            <Header />
            {children}
            <Toaster
              position="bottom-left"
              toastOptions={{
                style: {
                  background: '#18181b',
                  color: '#ffffff',
                  border: '1px solid #27272a',
                },
                success: {
                  iconTheme: {
                    primary: '#22c55e',
                    secondary: '#ffffff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#ffffff',
                  },
                },
              }}
            />
          </BlogProvider>
        </NostrProvider>
      </body>
    </html>
  );
}
