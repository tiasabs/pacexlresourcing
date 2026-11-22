import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resourcing Radar | Prototype",
  description: "A shared view of people, projects and capacity for a fictional charity PMO.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-GB" data-motion="system">
      <body>{children}</body>
    </html>
  );
}
