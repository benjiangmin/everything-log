// A note on the home page when no phone is linked to your account (the phone is what records
// your day), or when it hasn't checked in for a while.
export default function PhoneNote({ phone, now }: { phone: { name: string | null; last_seen: string } | null | "unknown"; now: number }) {
  if (phone === "unknown") return null; // (036_phones.sql not run yet)
  const quietFor = phone ? now - +new Date(phone.last_seen) : 0;
  if (phone && quietFor < 24 * 3600_000) return null;
  return (
    <div role="status" className="mt-5 flex items-start gap-3 rounded-card border border-line bg-surface px-5 py-4">
      <span aria-hidden className="mt-0.5 text-xl">📱</span>
      <div className="text-sm">
        {phone ? (
          <>
            <p className="font-semibold">Your phone hasn&apos;t checked in for {Math.floor(quietFor / (24 * 3600_000))} day{quietFor >= 48 * 3600_000 ? "s" : ""}</p>
            <p className="mt-0.5 text-muted">Open Minute by Minute on {phone.name ?? "your phone"} so it can send what it recorded. If it stopped, check that Location is set to Always.</p>
          </>
        ) : (
          <>
            <p className="font-semibold">No phone linked yet</p>
            <p className="mt-0.5 text-muted">Your day is recorded by the phone app. Install Minute by Minute on your iPhone and sign in with this same account. One phone at a time.</p>
          </>
        )}
      </div>
    </div>
  );
}
