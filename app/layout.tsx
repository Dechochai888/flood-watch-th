import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "น้ำท่วมไหน #ฉะเชิงเทราเราช่วยกัน",
  description: "แผนที่ชุมชนสำหรับแจ้งจุดน้ำท่วมและขอความช่วยเหลือในฉะเชิงเทรา พร้อมรูปภาพ ระดับน้ำ และพิกัด",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
