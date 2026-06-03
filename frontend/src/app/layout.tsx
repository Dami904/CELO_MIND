import type { Metadata } from "next";
import "./globals.css";
import Web3ModalProvider from "@/components/Web3ModalProvider";
import Navbar from "@/components/ui/Navbar";

export const metadata: Metadata = {
  title: "CeloMind MCP | Command Center",
  description: "Autonomous Web3 Agent Console for the Celo Network",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#050605] py-6 px-4 md:px-8 min-h-screen flex items-center justify-center font-sans">
        <Web3ModalProvider>
          <div
            id="cm-root"
            className="w-full max-w-6xl bg-dark text-text border border-border rounded-2xl overflow-hidden flex flex-col min-h-[680px] shadow-[0_0_50px_rgba(0,0,0,0.85)]"
          >
            <Navbar />
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {children}
            </div>
          </div>
        </Web3ModalProvider>
      </body>
    </html>
  );
}
