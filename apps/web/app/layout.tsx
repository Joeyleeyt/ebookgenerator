import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { themeInitScript } from '../lib/theme.js';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'Ebookly — Turn YouTube audience intelligence into profitable books',
  description:
    'Ebookly analyzes your YouTube channel and audience to surface book opportunities, then writes a professional 100+ page ebook you can edit and export.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
