import type { Metadata } from "next";
import "./globals.css";
import "@xyflow/react/dist/style.css";
import "../src/style.css";

export const metadata: Metadata = {
  title: "Idle Economy Lab",
  description: "A collaborative workbench for modeling, simulating, and balancing incremental game economies.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
