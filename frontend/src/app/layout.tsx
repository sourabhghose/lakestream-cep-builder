import type { Metadata } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "LakeStream CEP Builder",
  description: "Visual CEP Pipeline Builder for Databricks",
};

const themeInitScript = `
(function(){
  var k='lakestream-theme';
  var s=localStorage.getItem(k);
  var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
  var t=s==='light'||s==='dark'?s:(d?'dark':'light');
  document.documentElement.classList.toggle('dark',t==='dark');
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Tooltip.Provider delayDuration={300}>
          {children}
        </Tooltip.Provider>
      </body>
    </html>
  );
}
