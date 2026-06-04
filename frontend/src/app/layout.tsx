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
      {/*
        Mobile: body is a hard h-screen column so the flex chain has a definite boundary →
        the chat message feed scrolls internally and the input stays pinned.
        Desktop (md:): body reverts to auto height / centered row so the card can grow naturally.
      */}
      <body className="antialiased bg-[#050605] h-screen flex flex-col overflow-hidden md:h-auto md:min-h-screen md:flex-row md:overflow-auto md:items-center md:justify-center md:py-6 md:px-8 font-sans">
        <Web3ModalProvider>
          <div
            id="cm-root"
            className="w-full h-full flex flex-col md:h-auto md:max-w-6xl md:min-h-[680px] bg-dark text-text border-0 md:border border-border rounded-none md:rounded-2xl overflow-hidden shadow-none md:shadow-[0_0_50px_rgba(0,0,0,0.85)]"
          >
            <Navbar />
            {/* overflow-y-auto (not overflow-hidden) so landing/dashboard can page-scroll
                on mobile; min-h-0 completes the height chain for the chat page. */}
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto relative pb-20 md:pb-0">
              {children}
            </div>
          </div>
        </Web3ModalProvider>
      </body>
    </html>
  );
}
