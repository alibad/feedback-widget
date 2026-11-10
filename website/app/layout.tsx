import type { Metadata } from 'next';
import { HqThemeScript } from '@/components/hq-path/hq-path';
import '@/components/hq-path/hq-path.css';
import './globals.css';

// The Path type (Fraunces, Instrument Sans, JetBrains Mono) loads here, not through a CSS @import.
const pathFonts =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..800;1,9..144,300..600&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
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
  manifest: '/manifest.webmanifest',
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
    <html lang="en" data-hqp-t="pattern" suppressHydrationWarning>
      <head>
        <HqThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={pathFonts} />
      </head>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({"@context":"https://schema.org","@type":"SoftwareApplication",name:"Feedback Widget",url:origin,description,applicationCategory:"DeveloperApplication",operatingSystem:"Web",codeRepository:"https://github.com/alibad/feedback-widget",license:"https://github.com/alibad/feedback-widget/blob/main/LICENSE",publisher:{"@type":"Organization",name:"Human Quest",url:"https://www.humanquest.net/"}}).replace(/</g, '\\u003c') }} />
        {children}
      </body>
    </html>
  );
}
