import type { ReactNode } from 'react';
import { colors } from './ui.js';

export const metadata = {
  title: 'YouTube Ebook Generator',
  description: 'Turn a YouTube channel into a 100-page ebook.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          margin: 0,
          minHeight: '100vh',
          background: colors.canvas,
          color: colors.text,
        }}
      >
        {children}
      </body>
    </html>
  );
}
