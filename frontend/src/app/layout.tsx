import type { Metadata } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
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
        <Tooltip.Provider delayDuration={300}>
          {children}
        </Tooltip.Provider>
      </body>
    </html>
  );
}
