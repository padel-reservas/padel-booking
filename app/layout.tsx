export const metadata = {
  title: 'Padel Booking',
  description: 'Mini web de reservas para pádel',
  manifest: '/manifest.webmanifest',
  themeColor: '#111827',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        {/* iPhone support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Padel Booking" />

        {/* Icono iOS */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>

      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
