import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Deterministic AI UI Builder",
  description: "Safe, reproducible AI UI generation with a fixed component library",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
