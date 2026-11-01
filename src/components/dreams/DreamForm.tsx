"use client";

import { useState, useTransition } from "react";
import { addDreams } from "@/app/dreams/actions";
import DateWheel from "@/components/ui/DateWheel";
import RichText from "./RichText";
import Pictures, { prepare, type NewPicture } from "./Pictures";
import { localNow } from "@/lib/month";

// One dream being written: its text (HTML) and the pictures to upload with it.
type Draft = { key: number; body: string; added: NewPicture[] };

let nextKey = 0;
const emptyDraft = (): Draft => ({ key: nextKey++, body: "", added: [] });

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The "Last night" box on the left: one or more dreams for a date.
export default function DreamForm({ defaultDate }: { defaultDate?: string }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => [emptyDraft()]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const date = defaultDate ?? todayKey();

  const update = (key: number, change: (d: Draft) => Draft) =>
    setDrafts((list) => list.map((d) => (d.key === key ? change(d) : d)));

  async function addFiles(key: number, files: File[]) {
    const ready = await prepare(files);
    if (ready.length > 0) update(key, (d) => ({ ...d, added: [...d.added, ...ready] }));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget); // includes the date
    formData.set("dreams", JSON.stringify(drafts.map((d) => ({ body: d.body, newCount: d.added.length }))));
    drafts.forEach((d, i) => d.added.forEach((a, k) => formData.append(`file_${i}_${k}`, a.file)));

    startTransition(async () => {
      const res = await addDreams(formData);
      if (!res.ok) return setMessage({ ok: false, text: res.message ?? "Couldn't save." });
      drafts.forEach((d) => d.added.forEach((a) => URL.revokeObjectURL(a.preview)));
      setDrafts([emptyDraft()]); // start fresh, keep the date
      setMessage({ ok: true, text: "Saved." });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Last night</h2>
        <div className="w-44">
          <DateWheel key={date} name="dream_date" defaultValue={date} />
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {drafts.map((d, i) => (
          <div key={d.key}>
            {drafts.length > 1 && (
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-display text-sm font-semibold text-accent">Dream {i + 1}</span>
                <button
                  type="button"
                  onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
                  className="text-xs text-muted transition-colors hover:text-danger"
                >
                  Remove
                </button>
              </div>
            )}
            <RichText
              initial=""
              onChange={(body) => update(d.key, (x) => ({ ...x, body }))}
              onFiles={(files) => addFiles(d.key, files)}
              placeholder={i === 0 ? "I have a dream....that one day blah blah blah" : "Another dream…"}
              label={`Dream ${i + 1}`}
            />
            <Pictures
              added={d.added}
              onRemoveAdded={(p) => update(d.key, (x) => ({ ...x, added: x.added.filter((y) => y !== p) }))}
              onAdd={(files) => addFiles(d.key, files)}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDrafts((list) => [...list, emptyDraft()])}
        className="mt-3 self-start text-sm font-semibold text-accent underline-offset-4 hover:underline"
      >
        + Add another dream?
      </button>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save entry"}
        </button>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-muted" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
