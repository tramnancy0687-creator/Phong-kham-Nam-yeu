import { Be_Vietnam_Pro } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { Toaster } from '@/components/ui';
import './globals.css';

const font = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: 'Phòng khám Nấm yêu',
  description: 'Hệ thống quản lý phòng khám nha khoa',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className={font.className}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
