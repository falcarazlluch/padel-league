import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PWARegister } from './_components/PWARegister';

export const metadata: Metadata = {
  title: 'Padel League',
  description: 'Gestión privada de ligas de pádel',
  applicationName: 'Padel League',
  appleWebApp: {
    capable: true,
    title: 'Padel League',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logopwa.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0D1E45',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
