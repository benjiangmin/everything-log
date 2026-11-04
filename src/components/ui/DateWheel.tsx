"use client";

import { useEffect, useRef, useState } from "react";
import { PickerButton, usePopover, Wheel, WheelPanel } from "./Wheel";
import { localNow } from "@/lib/month";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate(); // m is 1–12

// Phone-style date picker: click the field to open it, then scroll or tap each wheel.
// Submits as a hidden "YYYY-MM-DD" input so the form/server action don't change.
// Optional onChange: called with the new date when the picker closes (not on every wheel tick).
// noYear: the box shows "Oct 29" (the year is still in the wheels). display: show this instead (e.g. "?").
// years: how far back / ahead the year wheel goes (default: 5 back, 1 ahead).
export default function DateWheel({
  name,
  defaultValue,
  onChange,
  noYear = false,
  display,
  years: yearRange = [-5, 1],
}: {
  name: string;
  defaultValue: string;
  onChange?: (value: string) => void;
  noYear?: boolean;
  display?: string;
  years?: [number, number]; // [back, ahead] from this year
}) {
  const [y0, m0, d0] = defaultValue.split("-").map(Number);
  const [year, setYear] = useState(y0);
  const [month, setMonth] = useState(m0);
  const [day, setDay] = useState(d0);
  const { open, setOpen, ref } = usePopover();

  const thisYear = localNow().getFullYear();
  const first = Math.min(thisYear + yearRange[0], y0);
  const last = Math.max(thisYear + yearRange[1], y0); // a saved date outside the range still shows
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const maxDay = daysIn(year, month);
  const safeDay = Math.min(day, maxDay);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const value = `${year}-${pad(month)}-${pad(safeDay)}`;
  // Tell the parent about the new date once the picker closes.
  // With a placeholder showing (display), opening and closing the picker counts as choosing that date.
  const emitted = useRef(value);
  const wasOpen = useRef(false);
  const placeholder = display !== undefined;
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    const justClosed = wasOpen.current;
    wasOpen.current = false;
    if (value !== emitted.current || (justClosed && placeholder)) {
      emitted.current = value;
      onChange?.(value);
    }
  }, [open, value, onChange, placeholder]);

  const label = new Date(year, month - 1, safeDay).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(noYear ? {} : { year: "numeric" }),
  });

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={value} />
      <PickerButton open={open} onClick={() => setOpen((o) => !o)}>
        {display ?? label}
      </PickerButton>

      {open && (
        <WheelPanel>
          <Wheel items={MONTHS} index={month - 1} onChange={(i) => setMonth(i + 1)} label="Month" />
          <Wheel items={days} index={safeDay - 1} onChange={(i) => setDay(i + 1)} label="Day" />
          <Wheel items={years} index={years.indexOf(year)} onChange={(i) => setYear(years[i])} label="Year" />
        </WheelPanel>
      )}
    </div>
  );
}
