import { useEffect, useState } from "react";
import Avatar, { makeSeed } from "./avatar.jsx";
import { VIBES } from "./api.js";
import { saveProfile } from "./profile.js";

/* ---------- tutorial slides ---------- */

const SLIDES = [
  {
    emoji: "🎈",
    title: "Welcome to Hangout",
    text: "The group scheduler that actually decides. No more “we should hang out soon” dying in the group chat.",
  },
  {
    emoji: "📤",
    title: "One link does everything",
    text: "Pick the days and times that could work, then share one link. Friends tap when they're free and vote on the spot. When everyone's in, the plan locks itself. Time, place, done.",
  },
  {
    emoji: "🤖",
    title: "Meet JAX",
    text: "Your personal JAX assistant. It suggests ideas tuned to your group's vibe, finds real spots near you, and can even talk out loud. Ask it anything while you plan.",
  },
  {
    emoji: "📅",
    title: "Never flake again",
    text: "Locked plans go straight to your calendar, your hangouts live on your home screen, and the app installs to your phone like a real app. Ready?",
  },
];

function Tour({ onDone }) {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <div className="page center">
      <div className="card onboard tour">
        <div className="logo">🎈 Hangout</div>
        <div className="tour-emoji">{s.emoji}</div>
        <h1>{s.title}</h1>
        <p className="muted">{s.text}</p>
        <div className="dots">
          {SLIDES.map((_, d) => (
            <span key={d} className={`dot ${d === i ? "on" : ""}`} onClick={() => setI(d)} />
          ))}
        </div>
        <button
          className="btn primary big"
          onClick={() => (last ? onDone() : setI(i + 1))}
        >
          {last ? "Let's go 🚀" : "Next"}
        </button>
        {!last && (
          <button className="btn ghost" onClick={onDone}>Skip the tour</button>
        )}
      </div>
    </div>
  );
}

/* ---------- auth ---------- */

async function authReq(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function SignUp({ onDone, toLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vibes, setVibes] = useState([]);
  const [spin, setSpin] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const seed = makeSeed(name || "you", vibes) + (spin ? `#${spin}` : "");
  const toggleVibe = (v) =>
    setVibes(vibes.includes(v) ? vibes.filter((x) => x !== v) : [...vibes, v].slice(0, 6));

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const { token, user } = await authReq("/api/auth/signup", {
        name, email, password, seed, vibes,
      });
      const profile = { token, name: user.name, email: user.email, seed, vibes };
      saveProfile(profile);
      onDone(profile);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page center">
      <div className="card onboard">
        <div className="logo">🎈 Hangout</div>
        <h1>Create your account</h1>
        <div className="big-avatar"><Avatar seed={seed} size={128} /></div>
        <button className="btn ghost" type="button" onClick={() => setSpin(spin + 1)}>
          🎲 Remix my avatar
        </button>
        <label className="field" style={{ textAlign: "left" }}>
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What your friends call you" maxLength={40} />
        </label>
        <label className="field" style={{ textAlign: "left" }}>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={80} />
        </label>
        <label className="field" style={{ textAlign: "left" }}>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ characters" maxLength={80} />
        </label>
        <div className="field" style={{ textAlign: "left" }}>
          <span>Your vibe <em>(shapes your avatar + suggestions)</em></span>
          <div className="chip-row wrap">
            {VIBES.map((v) => (
              <button key={v.key} type="button"
                className={`chip tag ${vibes.includes(v.key) ? "on" : ""}`}
                onClick={() => toggleVibe(v.key)}>
                {v.emoji} {v.label}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy} onClick={submit}>
          {busy ? "Creating…" : "Create account 🎉"}
        </button>
        <button className="btn ghost" onClick={toLogin}>I already have an account</button>
      </div>
    </div>
  );
}

function LogIn({ onDone, toSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const { token, user } = await authReq("/api/auth/login", { email, password });
      const profile = { token, name: user.name, email: user.email, seed: user.seed, vibes: user.vibes };
      saveProfile(profile);
      onDone(profile);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page center">
      <div className="card onboard">
        <div className="logo">🎈 Hangout</div>
        <h1>Welcome back</h1>
        <label className="field" style={{ textAlign: "left" }}>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={80} />
        </label>
        <label className="field" style={{ textAlign: "left" }}>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Your password" maxLength={80} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy} onClick={submit}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <button className="btn ghost" onClick={toSignup}>I need an account</button>
      </div>
    </div>
  );
}

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState("tour"); // tour → signup | login
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  if (step === "tour") return <Tour onDone={() => setStep("signup")} />;
  if (step === "login") return <LogIn onDone={onDone} toSignup={() => setStep("signup")} />;
  return <SignUp onDone={onDone} toLogin={() => setStep("login")} />;
}
