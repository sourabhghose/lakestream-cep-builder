import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "LakeStream CEP Builder",
  description: "Visual CEP Pipeline Builder for Databricks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
