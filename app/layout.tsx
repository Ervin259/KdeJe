import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KdeJe",
  description: "Evidencia neprítomností – Euro Data Distribution s.r.o.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk">
      <body>{children}</body>
    </html>
  );
}
