import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, AVAILABLE_THEMES, EFFECTIVE_DEFAULT_THEME } from "@/lib/app-config";
import { I18nProvider } from "@/i18n/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var allowed=${JSON.stringify(AVAILABLE_THEMES.map((item) => item.value))};var t=localStorage.getItem("ora-theme");document.documentElement.dataset.theme=t==="dark"?"dark":(allowed.includes(t)?t:${JSON.stringify(EFFECTIVE_DEFAULT_THEME)})}catch(e){document.documentElement.dataset.theme=${JSON.stringify(EFFECTIVE_DEFAULT_THEME)}}`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}><I18nProvider>{children}</I18nProvider></body>
    </html>
  );
}
