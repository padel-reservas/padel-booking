export const metadata = {
  title: 'Padel Booking',
  description: 'Mini web de reservas para pádel',
};

export default function RootLayout({
  children,
}: {
  children: any;
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
