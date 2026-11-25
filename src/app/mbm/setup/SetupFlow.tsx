"use client";

import { useState } from "react";
import AboutYouSteps from "@/mbm/components/AboutYouSteps";
import { Badge, Clock, Dots, Points, Primary, Secondary, Slide, Stage } from "@/mbm/components/setup/Slides";

type Stop = "about" | "calendar" | "phone" | "done";

// After making the account: your name (from Google, to confirm) and the rest of About you, one
// question per slide (AboutYouSteps), your Google Calendar if it isn't in yet, then what only the
// phone can do. The phone's setup asks the same, then does its part right there.
export default function SetupFlow({ name, email, calendar, phone, start }: { name: string; email: string; calendar: boolean; phone: boolean; start: Stop }) {
  const stops: Stop[] = ["about", ...(calendar ? [] : (["calendar"] as Stop[])), ...(phone ? [] : (["phone"] as Stop[])), "done"];
  const [at, setAt] = useState(Math.max(0, stops.indexOf(start)));
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const go = (to: number) => {
    setDir(to > at ? "fwd" : "back");
    setAt(Math.min(stops.length - 1, Math.max(0, to)));
  };
  const stop = stops[at];

  return (
    <Stage back={at > 0 && stop !== "done"} onBack={() => go(at - 1)}>
      <div className="mb-8">
        <Dots at={at} of={stops.length} />
      </div>
      <div key={stop}>
        {stop === "about" && (
          <div className={dir === "fwd" ? "step-in-fwd" : "step-in-back"}>
            <AboutYouSteps initialName={name} onDone={() => go(at + 1)} />
          </div>
        )}
        {stop === "calendar" && (
          <Slide
            dir={dir}
            top={
              <Badge>
                <path d="M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4" />
              </Badge>
            }
            title="Bring in your Google Calendar"
            body="Your plans make the guesses better: a class on your calendar starts the right job when you get there."
            actions={
              <>
                <Primary href="/google/connect?next=%2Fsetup%3Fstep%3Dphone">Connect Google Calendar</Primary>
                <Secondary onClick={() => go(at + 1)}>Set up later</Secondary>
              </>
            }
          >
            <Points
              items={[
                { icon: <path d="M12 8v4l3 2 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />, title: "Shows on your day", text: "Events sit on the Day bar next to what you actually did." },
                { icon: <path d="M5 12l5 5L20 7" />, title: "Starts jobs for you", text: "Only the ones you set to start when they're on your calendar." },
              ]}
            />
          </Slide>
        )}
        {stop === "phone" && (
          <Slide
            dir={dir}
            top={
              <Badge>
                <path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z M11 18h2" />
              </Badge>
            }
            title="Finish setting up on your iPhone"
            body={
              <>
                Some things only your phone can do. Open Minute by Minute on your iPhone and sign in with <span className="font-semibold text-ink">{email}</span>: it walks you through them.
              </>
            }
            actions={<Primary onClick={() => go(at + 1)}>Got it</Primary>}
          >
            <Points
              items={[
                { icon: <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" />, title: "Location, set to Always", text: "How your day fills itself in: where you were, and how you got there." },
                { icon: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8 M10 20a2 2 0 0 0 4 0" />, title: "Notifications", text: "“Grabbing Chipotle?” Answer from the lock screen." },
                { icon: <path d="M4 5h16v11H4z M9 20h6 M12 16v4" />, title: "Screen time", text: "Which apps you used, through a few Shortcuts." },
                { icon: <path d="M3 18h18 M3 18V9 M21 18v-5a3 3 0 0 0-3-3h-7v8 M7 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />, title: "Sleep", text: "From Apple Health, so nights fill in too." },
              ]}
            />
          </Slide>
        )}
        {stop === "done" && (
          <Slide
            dir={dir}
            top={<Clock />}
            title={name ? `You're all set, ${name.split(" ")[0]}` : "You're all set"}
            body="Your day starts filling in as soon as your phone is set up. Everything here can be changed later in Settings."
            actions={<Primary href="/">Go to today</Primary>}
          />
        )}
      </div>
    </Stage>
  );
}
