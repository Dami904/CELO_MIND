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
      <body className="antialiased bg-[#050605] min-h-screen flex md:items-center md:justify-center md:py-6 md:px-8 font-sans">
        <Web3ModalProvider>
          <div
            id="cm-root"
            className="w-full md:max-w-6xl bg-dark text-text border-0 md:border border-border rounded-none md:rounded-2xl overflow-hidden flex flex-col min-h-screen md:min-h-[680px] shadow-none md:shadow-[0_0_50px_rgba(0,0,0,0.85)]"
          >
            <Navbar />
            <div className="flex-1 flex flex-col overflow-hidden relative pb-20 md:pb-0">
              {children}
            </div>
          </div>
        </Web3ModalProvider>
      </body>
    </html>
  );
}
