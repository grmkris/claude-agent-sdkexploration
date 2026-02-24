import type { Metadata, Viewport } from "next";

import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import { ProjectSidebar } from "@/components/project-sidebar";
import { SshBadge } from "@/components/ssh-badge";
import { Separator } from "@/components/ui/separator";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import Link from "next/link";

import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Claude Explorer",
  description: "Browse and interact with Claude Code sessions",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <Script
        src="//unpkg.com/react-grab/dist/index.global.js"
        crossOrigin="anonymous"
        strategy="beforeInteractive"
      />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <TooltipProvider>
            <SidebarProvider>
              <ProjectSidebar />
              <SidebarInset>
                <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Claude Explorer
                  </Link>
                  <SshBadge />
                </header>
                <div className="flex flex-1 flex-col overflow-hidden">
                  {children}
                </div>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
