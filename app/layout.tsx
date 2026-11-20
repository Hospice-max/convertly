import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Convertly — File Converter", description: "Convert documents and images online with Convertly and CloudConvert." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
