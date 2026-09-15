import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "LedgerApp",
  description: "LedgerApp byggs för tydlig svensk bokföring."
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
