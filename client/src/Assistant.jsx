import { useEffect, useRef, useState } from "react";
import { getProfile } from "./profile.js";
import { CATS, fetchNearby, getLocation } from "./Nearby.jsx";

const QUICKS = [
  "What should we do?",
  "We're broke — free ideas?",
  "Something we've never done",
  "Chill night ideas",
];

const PLANNING_QUICKS = [
  "Help me plan this",
  "Where should we go?",
  "Cheap ideas?",
  "Surprise me",
];

/* ---------- voice ---------- */

function speak(text, enabled) {
  if (!enabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  u.voice =
    voices.find((v) => /Daniel|Google UK English Male|en-GB/i.test(`${v.name} ${v.lang}`)) ||
    voices.find((v) => v.lang?.startsWith("en")) || null;
  u.rate = 1.02;
  u.pitch = 0.85;
  window.speechSynthesis.speak(u);
}

/* ---------- orb ---------- */

function Orb({ size = 52, active }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`orb ${active ? "active" : ""}`} role="img" aria-label="JAX">
      <defs>
        <radialGradient id="orbCore" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#e0f6ff" />
          <stop offset="45%" stopColor="#5cc8ff" />
          <stop offset="100%" stopColor="#1a2a6e" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="24" fill="url(#orbCore)" className="orb-core" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#5cc8ff" strokeWidth="1.5" opacity="0.7" strokeDasharray="40 30" className="orb-ring r1" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="#8b7bff" strokeWidth="1" opacity="0.5" strokeDasharray="18 40" className="orb-ring r2" />
      <circle cx="50" cy="50" r="47" fill="none" stroke="#5cc8ff" strokeWidth="0.6" opacity="0.35" strokeDasharray="4 10" className="orb-ring r3" />
      <circle cx="43" cy="42" r="5" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

/* ---------- typewriter bubble ---------- */

function TypeBubble({ text, ideas, instant, onDone, onTick, onAddPlace }) {
  const [n, setN] = useState(instant ? text.length : 0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (instant) return;
    if (n >= text.length) return;
    const t = setTimeout(() => {
      setN((x) => Math.min(x + 2, text.length));
      onTick?.();
    }, 16);
    return () => clearTimeout(t);
  }, [n, text, instant, onTick]);

  useEffect(() => {
    if (n >= text.length && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [n, text, onDone]);

  const typing = n < text.length;
  return (
    <div className="bubble bot term">
      {text.slice(0, n)}
      {typing && <span className="caret">▊</span>}
      {!typing && ideas?.length > 0 && (
        <div className="ideas" style={{ marginTop: 8 }}>
          {ideas.map((idea) => {
            const isPlace = idea.title.startsWith("📍");
            const placeName = idea.title.replace(/^📍\s*/, "");
            return (
              <div className="idea" key={idea.title}>
                <b>{idea.title}</b>
                <p>{idea.description}</p>
                {isPlace && onAddPlace && (
                  <button className="btn small add-place" onClick={() => onAddPlace(placeName)}>
                    + Add as place option
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- boot sequence ---------- */

const BOOT = (h, name) =>
  h
    ? [
        "▸ JAX CORE v2.1 — INITIALIZING…",
        "▸ LINKING GROUP DATAFEED… OK",
        `▸ ${Math.max(h.responses.length, 1)} ATTENDEE${h.responses.length === 1 ? "" : "S"} DETECTED · VIBE PROFILES LOADED`,
        `▸ ALL SYSTEMS ONLINE. ${name ? `GOOD TO SEE YOU, ${name.toUpperCase()}.` : "READY."}`,
      ]
    : [
        "▸ JAX CORE v2.1 — INITIALIZING…",
        "▸ PLANNING MODE ENGAGED",
        `▸ ALL SYSTEMS ONLINE. ${name ? `LET'S BUILD SOMETHING, ${name.toUpperCase()}.` : "READY."}`,
      ];

export default function Assistant({ hangout = null, draft = null, onAddPlace = null }) {
  const profile = getProfile();
  const [bootDone, setBootDone] = useState(0); // lines revealed
  const bootLines = BOOT(hangout, profile?.name);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(false);
  const [nearby, setNearby] = useState(null); // null = off, [] = loading/empty, [...] = loaded
  const [premium, setPremium] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [paywalled, setPaywalled] = useState(false);
  const [payLink, setPayLink] = useState(null);
  const [paymentsOn, setPaymentsOn] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const bottom = useRef(null);

  const refreshStatus = async () => {
    const s = await fetch(`/api/premium/status?token=${profile?.token || ""}`).then((r) => r.json());
    setPremium(s.premium);
    setRemaining(s.remaining);
    return s.premium;
  };

  // premium status + payment config; poll after returning from checkout
  useEffect(() => {
    (async () => {
      try {
        await refreshStatus();
        const c = await fetch("/api/config").then((r) => r.json());
        setPayLink(c.paymentLink);
        setPaymentsOn(c.paymentsEnabled);
        if (new URLSearchParams(window.location.search).get("upgraded") === "1") {
          // webhook can lag a few seconds behind the redirect
          for (let i = 0; i < 10; i++) {
            if (await refreshStatus()) break;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = async () => {
    setPayBusy(true);
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: profile?.token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url; // Stripe checkout: Apple Pay / Google Pay / card
    } catch (err) {
      setCodeErr(err.message);
      setPayBusy(false);
    }
  };

  const redeem = async () => {
    setCodeErr("");
    try {
      const res = await fetch("/api/premium/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: profile?.token, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPremium(true);
      setPaywalled(false);
      setMsgs((m) => [...m, { who: "bot", text: "Premium clearance verified. All limits removed — welcome to the inner circle." }]);
    } catch (err) {
      setCodeErr(err.message);
    }
  };

  const enableLocation = async () => {
    setMsgs((m) => [...m, { who: "bot", text: "Acquiring your coordinates… scanning the local grid." }]);
    try {
      const { lat, lon } = await getLocation();
      const results = await Promise.all(
        CATS.map((c) => fetchNearby(c, lat, lon).then(
          (spots) => spots.map((s) => ({ name: s.name, kind: s.cuisine || c.key })),
          () => []
        ))
      );
      const flat = results.flat().slice(0, 12);
      setNearby(flat);
      setMsgs((m) => [
        ...m,
        {
          who: "bot",
          text: flat.length > 0
            ? `Location intel online. ${flat.length} verified spots mapped in your sector — ask me where to go.`
            : "Sector scan complete, but no mapped venues found near you. I'll stick to general recommendations.",
        },
      ]);
    } catch {
      setNearby(null);
      setMsgs((m) => [...m, { who: "bot", text: "Location access denied. Enable it in your browser to unlock local intel." }]);
    }
    setTimeout(scroll, 60);
  };

  // reveal boot lines one by one
  useEffect(() => {
    if (bootDone >= bootLines.length) return;
    const t = setTimeout(() => setBootDone((b) => b + 1), bootDone === 0 ? 300 : 550);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootDone]);

  // greeting after boot
  useEffect(() => {
    if (bootDone === bootLines.length && msgs.length === 0) {
      setMsgs([{
        who: "bot",
        text: hangout
          ? `At your service. I've analyzed "${hangout.title}" — ask me anything, or select a directive below.`
          : "At your service. Tell me what kind of hangout you're going for — I'll pitch ideas, and with local intel enabled I'll find real spots you can add straight to the plan.",
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootDone]);

  const scroll = () => bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const ask = async (q) => {
    const question = (q || input).trim();
    if (!question || busy) return;
    setInput("");
    setMsgs((m) => [...m, { who: "me", text: question }]);
    setBusy(true);
    try {
      const res = await fetch(hangout ? `/api/hangouts/${hangout.id}/assistant` : "/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question, vibes: profile?.vibes || [], nearby: nearby || [],
          clientToken: profile?.token || "",
          draft: draft || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setPaywalled(true);
        if (data.paymentLink) setPayLink(data.paymentLink);
        setMsgs((m) => [...m, { who: "bot", text: "Free query allocation depleted. Premium clearance required to continue — see below." }]);
      } else {
        setMsgs((m) => [...m, { who: "bot", text: data.reply, ideas: data.ideas }]);
        if (data.remaining != null) setRemaining(data.remaining);
        if (data.premium) setPremium(true);
        speak(data.reply, voice);
      }
    } catch {
      setMsgs((m) => [...m, { who: "bot", text: "Signal interference detected. Re-run that query." }]);
    }
    setBusy(false);
    setTimeout(scroll, 60);
  };

  const booting = bootDone < bootLines.length;

  return (
    <div className="card buddy-card holo">
      <i className="hud-corner tl" /><i className="hud-corner tr" />
      <i className="hud-corner bl" /><i className="hud-corner br" />
      <div className="scan-beam" />

      <div className="buddy-head">
        <div className="buddy-face"><Orb active={busy || booting} /></div>
        <div style={{ flex: 1 }}>
          <b className="nova-name">J A X</b>
          <small className="nova-status">
            {booting
              ? "◌ initializing…"
              : premium
                ? "★ premium — unlimited access"
                : remaining != null
                  ? `● online — ${remaining} free ${remaining === 1 ? "query" : "queries"} left`
                  : "● online — hangout intelligence"}
          </small>
        </div>
        <button
          className={`voice-toggle ${voice ? "on" : ""}`}
          title={voice ? "Voice on" : "Voice off"}
          onClick={() => {
            const next = !voice;
            setVoice(next);
            if (next) speak("Voice interface enabled.", true);
            else window.speechSynthesis?.cancel();
          }}
        >
          {voice ? "🔊" : "🔇"}
        </button>
      </div>

      <div className="boot term">
        {bootLines.slice(0, bootDone).map((l, i) => (
          <div className="boot-line" key={i}>{l}</div>
        ))}
      </div>

      {!booting && (
        <>
          <div className="chat">
            {msgs.map((m, i) =>
              m.who === "me" ? (
                <div key={i} className="bubble me">{m.text}</div>
              ) : (
                <TypeBubble
                  key={i}
                  text={m.text}
                  ideas={m.ideas}
                  instant={i < msgs.length - 1}
                  onTick={i === msgs.length - 1 ? scroll : undefined}
                  onDone={scroll}
                  onAddPlace={onAddPlace}
                />
              )
            )}
            {busy && <div className="bubble bot term typing">▊ processing…</div>}
            <div ref={bottom} />
          </div>

          <div className="quick-row">
            {(hangout ? QUICKS : PLANNING_QUICKS).map((q) => (
              <button key={q} className="quick" onClick={() => ask(q)} disabled={busy}>{q}</button>
            ))}
            {nearby === null && (
              <button className="quick geo" onClick={enableLocation} disabled={busy}>
                📡 Enable local intel
              </button>
            )}
            {nearby?.length > 0 && (
              <button className="quick geo on" onClick={() => ask("Where should we go near us?")} disabled={busy}>
                📍 Where should we go?
              </button>
            )}
          </div>

          {paywalled && !premium ? (
            <div className="paywall">
              <b className="nova-name">JAX PREMIUM</b>
              <p className="term paywall-pitch">
                Unlimited queries · local intel · voice · priority analysis
              </p>
              <div className="price">$3<small>/month</small></div>
              {paymentsOn ? (
                <button className="btn primary big" onClick={startCheckout} disabled={payBusy}>
                  {payBusy ? "Opening secure checkout…" : " Pay · G Pay · Card — Unlock ⚡"}
                </button>
              ) : payLink ? (
                <a className="btn primary big" href={payLink} target="_blank" rel="noreferrer">
                  Unlock JAX Unlimited ⚡
                </a>
              ) : (
                <p className="muted tiny">Payments are being set up — check back soon!</p>
              )}
              <button className="link-btn" onClick={() => setShowCode(!showCode)}>
                {showCode ? "hide code entry" : "have an access code?"}
              </button>
              {showCode && (
                <div className="ask-row">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Access code"
                    maxLength={30}
                  />
                  <button className="btn small" onClick={redeem}>Redeem</button>
                </div>
              )}
              {codeErr && <div className="error">{codeErr}</div>}
            </div>
          ) : (
            <div className="ask-row">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="Query JAX…"
                maxLength={300}
              />
              <button className="btn primary small" onClick={() => ask()} disabled={busy}>➤</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
