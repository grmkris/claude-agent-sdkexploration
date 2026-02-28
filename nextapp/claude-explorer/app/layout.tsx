import type { Metadata, Viewport } from "next";

import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import "./globals.css";
import Script from "next/script";

import { AgentTabBar } from "@/components/agent-tabs/agent-tab-bar";
import { ProjectSidebar } from "@/components/project-sidebar";
import { RightSidebar } from "@/components/right-sidebar";
import { RightSidebarProvider } from "@/components/ui/right-sidebar-context";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const tabBarVisible =
    cookieStore.get("agent_tab_bar_state")?.value !== "false";
  const leftSidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const rightSidebarOpen =
    cookieStore.get("right_sidebar_state")?.value === "true";

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
        <Providers tabBarVisible={tabBarVisible}>
          <TooltipProvider>
            <SidebarProvider defaultOpen={leftSidebarOpen}>
              <RightSidebarProvider defaultOpen={rightSidebarOpen}>
                <ProjectSidebar />
                <SidebarInset className="overflow-hidden h-svh">
                  <AgentTabBar />
                  <div className="flex flex-1 flex-col overflow-hidden">
                    {children}
                  </div>
                </SidebarInset>
                <RightSidebar />
              </RightSidebarProvider>
            </SidebarProvider>
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
