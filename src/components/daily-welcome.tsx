"use client";

import { useEffect, useState } from "react";

/**
 * A short good-morning for the team: a duck family waddling past, a line worth
 * reading, and then out of the way. Shown once per agent per day — it greets
 * people, it doesn't nag them.
 */

const QUOTES: { text: string; by?: string }[] = [
  { text: "The harder you work for something, the greater you'll feel when you achieve it." },
  { text: "Every call you make today is someone's peace of mind tomorrow." },
  { text: "Success is the sum of small efforts, repeated day in and day out.", by: "Robert Collier" },
  { text: "You don't have to be great to start, but you have to start to be great.", by: "Zig Ziglar" },
  { text: "The best time to reach someone was yesterday. The second best time is now." },
  { text: "People don't buy policies. They buy the feeling of being covered." },
  { text: "Courage is what it takes to stand up and speak; it's also what it takes to sit down and listen.", by: "Winston Churchill" },
  { text: "Make each day your masterpiece.", by: "John Wooden" },
  { text: "A no today is a not-yet, not a never." },
  { text: "Opportunities don't happen. You create them.", by: "Chris Grosser" },
  { text: "Quality is never an accident. It is always the result of intelligent effort.", by: "John Ruskin" },
  { text: "Be so good they can't ignore you.", by: "Steve Martin" },
  { text: "Someone on your list today is having the worst week of their year. Be the easy part of it." },
  { text: "Great things never came from comfort zones." },
  { text: "The expert in anything was once a beginner." },
  { text: "Your attitude, not your aptitude, will determine your altitude.", by: "Zig Ziglar" },
  { text: "Small daily improvements are the key to staggering long-term results." },
  { text: "Treat every renewal like a first date, not a formality." },
  { text: "Done is better than perfect, and follow-up beats both." },
  { text: "Energy and persistence conquer all things.", by: "Benjamin Franklin" },
  { text: "You miss 100% of the calls you don't make." },
  { text: "Kindness is free. Sprinkle it everywhere — especially on hold." },
];

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** One quote per day, the same for the whole team, so they can compare notes. */
function quoteOfTheDay() {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return QUOTES[dayOfYear % QUOTES.length];
}

/** Remembers today's greeting, surviving a blocked localStorage. */
function alreadyGreeted(userId: string): boolean {
  const key = `lm.welcome.${userId}.${dayKey()}`;
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const s = store();
      if (s.getItem(key) === "1") return true;
      s.setItem(key, "1");
      return false;
    } catch {
      // private window or blocked storage — try the next one
    }
  }
  return false; // no storage at all: greet them rather than never
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DailyWelcome({ userId, name }: { userId: string; name: string }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [quote, setQuote] = useState(QUOTES[0]);

  // First visit of the day only — a greeting, not a gate.
  useEffect(() => {
    if (alreadyGreeted(userId)) return;
    setQuote(quoteOfTheDay());
    setShow(true);
    const out = setTimeout(() => setLeaving(true), 4200);
    const gone = setTimeout(() => setShow(false), 4900);
    return () => { clearTimeout(out); clearTimeout(gone); };
  }, [userId]);

  if (!show) return null;

  const q = quote;
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <div
      onClick={() => setLeaving(true)}
      role="status"
      aria-live="polite"
      className={`dw-wrap ${leaving ? "dw-out" : ""}`}
    >
      <div className="dw-card">
        <svg viewBox="0 0 420 180" className="dw-scene" aria-hidden="true">
          <defs>
            <linearGradient id="dwSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bfe6ff" />
              <stop offset="100%" stopColor="#e8f7ff" />
            </linearGradient>
          </defs>

          <rect width="420" height="180" fill="url(#dwSky)" />
          <circle cx="360" cy="40" r="22" fill="#ffd45e" className="dw-sun" />

          <g className="dw-cloud dw-cloud-a" fill="#ffffff" opacity="0.95">
            <ellipse cx="80" cy="42" rx="26" ry="14" />
            <ellipse cx="100" cy="46" rx="20" ry="12" />
            <ellipse cx="62" cy="48" rx="18" ry="11" />
          </g>
          <g className="dw-cloud dw-cloud-b" fill="#ffffff" opacity="0.8">
            <ellipse cx="250" cy="30" rx="20" ry="11" />
            <ellipse cx="266" cy="33" rx="15" ry="9" />
          </g>

          {/* birds drifting across */}
          <g className="dw-birds" stroke="#4a6572" strokeWidth="2.5" fill="none" strokeLinecap="round">
            <path d="M40 70 q7 -7 14 0 q7 -7 14 0" />
            <path d="M92 86 q5 -5 10 0 q5 -5 10 0" opacity="0.75" />
          </g>

          {/* ground */}
          <rect y="140" width="420" height="40" fill="#8fd16a" />
          <rect y="140" width="420" height="6" fill="#7bc257" />

          {/* duck family waddling */}
          <g className="dw-parade">
            <g className="dw-duck dw-bob">
              <ellipse cx="0" cy="128" rx="19" ry="14" fill="#ffd45e" />
              <circle cx="14" cy="112" r="10" fill="#ffd45e" />
              <circle cx="17" cy="110" r="1.8" fill="#3b3b3b" />
              <path d="M23 113 l10 3 l-10 3 z" fill="#f4883a" />
              <path d="M-6 141 l0 5 M4 141 l0 5" stroke="#f4883a" strokeWidth="2.5" strokeLinecap="round" />
            </g>
            {/* Position lives on the outer group; the bob animates the inner one,
                so the two transforms can't overwrite each other. */}
            {[1, 2, 3].map((i) => (
              <g key={i} transform={`translate(${-32 * i} 0)`}>
                <g className="dw-bob" style={{ animationDelay: `${i * 0.16}s` }}>
                  <ellipse cx="0" cy="134" rx="11" ry="8.5" fill="#ffe07d" />
                  <circle cx="8" cy="124" r="6" fill="#ffe07d" />
                  <circle cx="10" cy="123" r="1.2" fill="#3b3b3b" />
                  <path d="M13.5 125 l6 2 l-6 2 z" fill="#f4a04a" />
                  <path d="M-3 142 l0 4 M3 142 l0 4" stroke="#f4a04a" strokeWidth="2" strokeLinecap="round" />
                </g>
              </g>
            ))}
          </g>

          {/* a few tufts of grass */}
          <g stroke="#6fae4c" strokeWidth="2.5" strokeLinecap="round">
            <path d="M30 152 q3 -9 6 0" /><path d="M150 155 q3 -8 6 0" /><path d="M300 152 q3 -9 6 0" />
          </g>
        </svg>

        <div className="dw-text">
          <p className="dw-hello">
            {greeting()}, {first}
          </p>
          <p className="dw-quote">&ldquo;{q.text}&rdquo;</p>
          {q.by ? <p className="dw-by">— {q.by}</p> : null}
          <p className="dw-skip">click anywhere to start</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .dw-wrap {
          position: fixed;
          inset: 0;
          z-index: 90;
          display: grid;
          place-items: center;
          padding: 16px;
          background: color-mix(in srgb, var(--color-bg, #f5f5f7) 86%, transparent);
          backdrop-filter: blur(6px);
          cursor: pointer;
          animation: dwIn 0.35s ease both;
        }
        .dw-out {
          animation: dwOut 0.6s ease forwards;
        }
        .dw-card {
          width: min(440px, 100%);
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-line, #e3e3e6);
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 24px 60px rgba(20, 20, 30, 0.18);
          animation: dwPop 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
        }
        .dw-scene {
          display: block;
          width: 100%;
        }
        .dw-text {
          padding: 18px 22px 20px;
          text-align: center;
        }
        .dw-hello {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--color-muted, #86868b);
        }
        .dw-quote {
          margin: 0;
          font-size: 17px;
          line-height: 1.45;
          font-weight: 600;
          color: var(--color-ink, #1d1d1f);
          text-wrap: balance;
        }
        .dw-by {
          margin: 8px 0 0;
          font-size: 13px;
          color: var(--color-muted, #86868b);
        }
        .dw-skip {
          margin: 14px 0 0;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--color-faint, #aeaeb2);
        }
        .dw-sun {
          transform-origin: 360px 40px;
          animation: dwPulse 3s ease-in-out infinite;
        }
        .dw-cloud-a {
          animation: dwDrift 9s linear infinite;
        }
        .dw-cloud-b {
          animation: dwDrift 13s linear infinite;
        }
        .dw-birds {
          animation: dwFly 7s linear infinite;
        }
        .dw-parade {
          animation: dwWaddle 5.2s linear infinite;
        }
        .dw-bob {
          animation: dwBob 0.42s ease-in-out infinite alternate;
        }
        @keyframes dwIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dwOut { to { opacity: 0; visibility: hidden } }
        @keyframes dwPop { from { opacity: 0; transform: translateY(14px) scale(0.96) } to { opacity: 1; transform: none } }
        @keyframes dwPulse { 50% { opacity: 0.82; r: 24px } }
        @keyframes dwDrift { from { transform: translateX(-60px) } to { transform: translateX(460px) } }
        @keyframes dwFly { from { transform: translateX(-80px) } to { transform: translateX(480px) } }
        @keyframes dwWaddle { from { transform: translateX(-40px) } to { transform: translateX(470px) } }
        @keyframes dwBob { from { transform: translateY(0) } to { transform: translateY(-3px) } }
        @media (prefers-reduced-motion: reduce) {
          .dw-sun, .dw-cloud-a, .dw-cloud-b, .dw-birds, .dw-parade, .dw-bob,
          .dw-wrap, .dw-card { animation: none }
          .dw-parade { transform: translateX(200px) }
        }
      ` }} />
    </div>
  );
}
