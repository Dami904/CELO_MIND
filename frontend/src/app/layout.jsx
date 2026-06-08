import './globals.css';
import Navbar from '../components/ui/Navbar';

export const metadata = {
  title: 'CeloMind — AI assistant for the Celo network',
  description:
    'Manage crypto, swap tokens, and stay safe on Celo — all through a natural conversation. No technical knowledge required.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;1,9..144,300&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-stone-50 text-slate-900 antialiased">
        {/* Wire onConnect + walletAddress from your existing wallet context/provider */}
        <Navbar />
        {children}
      </body>
    </html>
  );
}
