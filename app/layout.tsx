import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SidebarProvider } from "@/components/sidebar/SidebarContext";
import { SidebarWrapper } from "@/components/sidebar/SidebarWrapper";
import { ToastProvider } from "@/components/toast/ToastContext";
import { ToastContainer } from "@/components/toast/Toast";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Code Manager",
  description: "Manage your codebases in ~/Desktop/_code/",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-[family-name:var(--font-geist-sans)]`}
      >
        <ToastProvider>
          <SidebarProvider>
            <div className="flex h-screen overflow-hidden">
              <SidebarWrapper />
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
          </SidebarProvider>
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
