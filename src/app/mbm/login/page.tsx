import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in · Minute by Minute" };

export default function MbmLoginPage(props: PageProps<"/mbm/login">) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-card bg-surface p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Minute by Minute</h1>
        <p className="mt-1 text-sm text-muted">Your days, minute by minute. One account for the website and the phone app.</p>
        <Suspense fallback={<div className="mt-6 h-48" />}>
          {props.searchParams.then((p) => (
            <>
            {p.gone === "1" && <p role="status" className="mt-4 rounded-control bg-paper px-3 py-2 text-sm text-muted">That account was deleted, so you were signed out.</p>}
            <LoginForm next={typeof p.next === "string" ? p.next : "/mbm"} google={typeof p.google === "string" ? p.google : null} />
            </>
          ))}
        </Suspense>
      </div>
    </main>
  );
}
