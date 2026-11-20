import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Convertly — Conversion de fichiers", description: "Convertissez vos documents et images en ligne avec CloudConvert." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }
