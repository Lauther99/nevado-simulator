import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nevado Pisco · 5 752 m — Simulador Cordillera Blanca',
  description: 'Simulador 3D de alta montaña en el Nevado Pisco (Ruta Normal, Arista Suroeste), Cordillera Blanca, Perú.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
