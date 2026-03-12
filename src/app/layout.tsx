import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'SAAS Restaurante — Cuenta Compartida',
    template: '%s | SAAS Restaurante',
  },
  description: 'Sistema inteligente para dividir la cuenta del restaurante. Escanea el QR de tu mesa, selecciona tus consumos y paga tu parte al instante.',
  keywords: ['restaurante', 'cuenta compartida', 'dividir cuenta', 'QR', 'pago digital', 'SaaS'],
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    title: 'SAAS Restaurante — Cuenta Compartida',
    description: 'Divide la cuenta de tu mesa de forma rápida y transparente.',
    siteName: 'SAAS Restaurante',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
