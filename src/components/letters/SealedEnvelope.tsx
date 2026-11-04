"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Envelope } from "@/lib/letters";
import { longDate } from "./dates";

// How many quick taps break the seal, and how quick "quick" is.
const TAPS = 4;
const WINDOW_MS = 650; // longer than this between taps and it settles back down
const OPEN_MS = 1500; // the opening animation (see the .seal-pop … .env-away keyframes)

// A letter that just arrived, still sealed, in the middle of the screen. Tap it quickly a few times
// in a row: it shakes harder each time and the wax seal cracks, until it bursts open.
export default function SealedEnvelope({
  envelope,
  ready,
  onOpened,
  onClose,
}: {
  envelope: Envelope;
  ready: boolean; // the letter's words have loaded (it won't open before that)
  onOpened: () => void;
  onClose: () => void;
}) {
  const [taps, setTaps] = useState(0);
  const [shake, setShake] = useState(0); // bumps to replay the shake
  const [opening, setOpening] = useState(false);
  const last = useRef(0);
  const calm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !opening && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (calm.current) clearTimeout(calm.current);
    };
  }, [onClose, opening]);

  // Ready and enough taps: burst open, then hand over to the letter.
  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(onOpened, reduced.current ? 0 : OPEN_MS);
    return () => clearTimeout(t);
  }, [opening, onOpened]);

  function tap() {
    if (opening) return;
    const now = Date.now();
    const next = now - last.current > WINDOW_MS ? 1 : taps + 1;
    last.current = now;
    setShake((s) => s + 1);
    if ((next >= TAPS || reduced.current) && ready) {
      setTaps(TAPS);
      setOpening(true);
      return;
    }
    setTaps(Math.min(next, TAPS - 1));
    // Stop tapping and it settles back down.
    if (calm.current) clearTimeout(calm.current);
    calm.current = setTimeout(() => setTaps(0), WINDOW_MS);
  }

  const strength = taps / TAPS; // 0 → 1 as you tap

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button type="button" aria-label="Close" onClick={() => !opening && onClose()} className="absolute inset-0 bg-ink/50 transition-colors" />

      <div className={`relative flex flex-col items-center ${opening ? "env-away" : "env-in"}`}>
        <button
          key={shake}
          type="button"
          onClick={tap}
          aria-label={`Sealed letter: ${envelope.subject}. Tap quickly to open.`}
          style={{ "--shake": `${3 + strength * 9}px`, perspective: "900px" } as CSSProperties}
          className={`relative h-[13.5rem] w-[20rem] select-none sm:h-[15rem] sm:w-[22rem] ${shake > 0 && !opening ? "env-shake" : ""}`}
        >
          {/* Back of the envelope. */}
          <span className="absolute inset-0 rounded-[14px] bg-[#e3d3bd] shadow-2xl shadow-ink/40" />

          {/* The letter inside (slides up out of the envelope when it opens). */}
          <span className={`absolute inset-x-5 bottom-3 top-5 rounded-[8px] bg-paper shadow-md ${opening ? "paper-rise" : ""}`}>
            <span className="absolute inset-x-5 top-6 h-1.5 rounded-full bg-line" />
            <span className="absolute left-5 right-10 top-10 h-1.5 rounded-full bg-line" />
            <span className="absolute left-5 right-16 top-14 h-1.5 rounded-full bg-line" />
          </span>

          {/* Front pocket (the two side folds + bottom), in front of the letter. */}
          <span
            className="absolute inset-0 rounded-[14px] bg-[#ecdfcc]"
            style={{ clipPath: "polygon(0 0, 50% 58%, 100% 0, 100% 100%, 0 100%)" }}
          />
          <span
            className="absolute inset-0 rounded-[14px] bg-[#e6d7c2]"
            style={{ clipPath: "polygon(0 100%, 50% 52%, 100% 100%)" }}
          />

          {/* The subject, written on the front. */}
          <span className="absolute inset-x-6 bottom-5 truncate text-center font-display text-lg font-semibold text-ink/80">{envelope.subject}</span>

          {/* The top flap (swings up and over when it opens). */}
          <span
            className={`absolute inset-x-0 top-0 h-[58%] origin-top ${opening ? "flap-open" : ""}`}
            style={{ transformStyle: "preserve-3d" }}
          >
            <span
              className="absolute inset-0 rounded-t-[14px] bg-[#d9c6ab] shadow-sm"
              style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)", backfaceVisibility: "hidden" }}
            />
          </span>

          {/* The wax seal, cracking a little more with each quick tap. */}
          <span
            className={`absolute left-1/2 top-[58%] grid size-16 place-items-center rounded-full bg-[#9a3b30] shadow-lg shadow-ink/40 ring-4 ring-[#b5493c]/60 ${
              opening ? "seal-pop" : ""
            }`}
            style={{ transform: `translate(-50%, -50%) scale(${1 + strength * 0.12})` }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <text x="20" y="27" textAnchor="middle" fontSize="18" fontWeight="700" fill="#f3d9c9" fontFamily="var(--font-display)">
                B
              </text>
              {/* cracks */}
              <path d="M20 2 L18 10 L22 15" stroke="#3b130e" strokeWidth="1.6" strokeLinecap="round" style={{ opacity: taps >= 1 ? 0.9 : 0, transition: "opacity 120ms" }} />
              <path d="M38 22 L30 21 L27 26" stroke="#3b130e" strokeWidth="1.6" strokeLinecap="round" style={{ opacity: taps >= 2 ? 0.9 : 0, transition: "opacity 120ms" }} />
              <path d="M6 32 L13 27 L12 22" stroke="#3b130e" strokeWidth="1.6" strokeLinecap="round" style={{ opacity: taps >= 3 ? 0.9 : 0, transition: "opacity 120ms" }} />
            </svg>
          </span>
        </button>

        {/* How close you are. */}
        <div className={`mt-6 flex flex-col items-center gap-2 text-accent-ink transition-opacity ${opening ? "opacity-0" : ""}`}>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: TAPS }, (_, i) => (
              <span key={i} className={`size-2 rounded-full transition-colors duration-150 ${i < taps ? "bg-accent-ink" : "bg-accent-ink/25"}`} />
            ))}
          </div>
          <p className="text-sm opacity-80">
            {envelope.written_on ? `From ${longDate(envelope.written_on)}` : "From the past"} · tap quickly to break the seal
          </p>
        </div>
      </div>
    </div>
  );
}
