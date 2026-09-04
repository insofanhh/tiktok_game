import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tiktok-kingdom-clash.anhha2k2.chatgpt.site',
  ),
  title: 'TikTok Kingdom Clash',
  description: 'Interactive live battle game for TikTok Live and OBS.',
  openGraph: {
    title: 'TikTok Kingdom Clash',
    description: 'Xanh vs Đỏ — game tương tác trực tiếp dành cho TikTok Live.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'TikTok Kingdom Clash — Xanh vs Đỏ' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TikTok Kingdom Clash',
    description: 'Xanh vs Đỏ — game tương tác trực tiếp dành cho TikTok Live.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
