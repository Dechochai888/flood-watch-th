import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "น้ำท่วมไหน — แผนที่แจ้งเตือนน้ำท่วมจากชุมชน",
  description: "แจ้งและติดตามจุดน้ำท่วมบนแผนที่ พร้อมรูปภาพ ระดับน้ำ และพิกัดจากคนในพื้นที่",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
