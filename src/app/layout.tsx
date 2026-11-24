import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import SideNav from "@/components/ui/SideNav";
import SubmitShortcut from "@/components/ui/SubmitShortcut";
import { ThemeSync } from "@/components/ui/theme";
import { sunTimes } from "@/mbm/sun";

export const metadata: Metadata = {
  title: "benbadobee",
  description: "my life log",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // (suppressHydrationWarning: the night-mode script below sets data-theme before React loads.)
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Night mode, set before anything's drawn, so a dark page never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ConfirmProvider>
          {/* The navigation bar on the left of every page (not the login page). */}
          <Suspense fallback={null}>
            <SideNav />
            {/* Day / night follows you between Minute by Minute and everything-log (each has its
                own setting), and the sun when it's set to. */}
            <ThemeSync />
          </Suspense>
          {/* ⌘↵ / Ctrl+↵ submits whatever you're typing in. */}
          <SubmitShortcut />
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}

// Which app you're in (Minute by Minute or everything-log), its setting (day / night / sun), and
// for "sun", whether it's between sunset and sunrise where you are (theme.ts has the same rules).
const THEME_SCRIPT = `try{
var p=location.pathname,h=location.hostname,app=(p==="/mbm"||p.indexOf("/mbm/")===0||h==="minutexminute.com"||h==="www.minutexminute.com"||h==="mbm.localhost")?"mbm":"log";
if(app==="mbm"&&p.indexOf("/mbm")!==0)document.documentElement.dataset.app="mbm";
var m=localStorage.getItem("theme:"+app);
if(m!=="day"&&m!=="night"&&m!=="sun")m=localStorage.getItem("theme")==="dark"?"night":"day";
var d=m==="night";
if(m==="sun"){var w=[43.0731,-89.4012];try{var v=JSON.parse(localStorage.getItem("theme:where"));if(v&&v.length===2)w=v}catch(e){}
var sunTimes=${sunTimes.toString()};var n=Date.now(),s=sunTimes(n,w[0],w[1]);d=s?(n<s.rise||n>=s.set):false}
if(d)document.documentElement.dataset.theme="dark"
}catch(e){}`;
