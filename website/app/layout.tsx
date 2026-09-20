import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});
const origin = 'https://feedback.humanquest.net';
const title = 'Feedback Widget — Better bug reports. Built into your app.';
const description =
  'An open-source coding skill for in-app feedback. Your infrastructure. GitHub or Linear. MIT licensed.';

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title,
  description,
  alternates: { canonical: '/' },
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    url: origin,
    title,
    description,
    images: [
      {
        url: origin + '/og.png',
        width: 1730,
        height: 909,
        alt: 'Feedback Widget — Better bug reports. Built into your app. Open source, GitHub + Linear, MIT.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [origin + '/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={
          geistSans.variable + ' ' + geistMono.variable + ' antialiased'
        }
      >
        {children}
      </body>
    </html>
  );
}
