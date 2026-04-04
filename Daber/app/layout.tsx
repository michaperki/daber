import './globals.css';

export const metadata = {
  title: 'Daber',
  description: 'Hebrew vocabulary drills',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
