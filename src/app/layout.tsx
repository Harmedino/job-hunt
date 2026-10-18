import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Launchpad · Personal job finder",
  description:
    "Find your next opportunity. A private workspace for discovering jobs and preparing honest applications.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
