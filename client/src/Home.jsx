import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SquadsCard } from "./Squads.jsx";
import { createHangout, getHangout, remember, BLOCKS, fmtDay, blockInfo } from "./api.js";
import { clearProfile, getHistory, recordHangout } from "./profile.js";
import Avatar from "./avatar.jsx";
import Nearby from "./Nearby.jsx";
import Assistant from "./Assistant.jsx";

function MyHangouts() {
  const [items, setItems] = useState(getHistory());

  useEffect(() => {
    let live = true;
    (async () => {
      const enriched = await Promise.all(
        getHistory().slice(0, 8).map(async (item) => {
          try {
            const h = await getHangout(item.id);
            return { ...item, title: h.title, h };
          } catch {
            return null; // deleted/unreachable → drop
          }
        })
      );
      if (live) setItems(enriched.filter(Boolean));
    })();
    return () => { live = false; };
  }, []);

  if (items.length === 0) return null;

  const status = (h) => {
    if (!h) return "";
    if (h.canceledAt) return "🚫 canceled";
    if (h.decidedSlot) {
      const [date, block] = h.decidedSlot.split("|");
      return `✅ ${fmtDay(date)} ${blockInfo(block).emoji}`;
    }
    return `⏳ ${h.responses.length}${h.expected ? `/${h.expected}` : ""} in`;
  };

  return (
    <div className="card">
      <h3>Your hangouts</h3>
      <div className="nearby-list">
        {items.map((item) => (
          <Link className="spot" key={item.id} to={`/h/${item.id}`}>
            <div className="s-info">
              <b>{item.title}</b>
              <small>{item.role === "organizer" ? "you're organizing" : "you're in"}</small>
            </div>
            <small className="muted">{status(item.h)}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}

function localISO(d) {
  // Local date, not UTC — toISOString() shifts the date at night!
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextDays(n = 14) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(localISO(d));
  }
  return out;
}

export default function Home({ profile, onResetProfile }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const squadId = params.get("squad");
  const squadName = params.get("squadName");
  const candidates = useMemo(() => nextDays(14), []);
  const [title, setTitle] = useState("");
  const [surprise, setSurprise] = useState(false);
  const [note, setNote] = useState("");
  const [days, setDays] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [places, setPlaces] = useState([]);
  const [placeInput, setPlaceInput] = useState("");
  const [expected, setExpected] = useState(4);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (list, setList, v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const addPlace = (name) => {
    const p = (name ?? placeInput).trim();
    if (p && !places.includes(p) && places.length < 8) setPlaces((prev) => [...prev, p]);
    if (name == null) setPlaceInput("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Give your hangout a name!");
    if (days.length === 0) return setError("Pick at least one day that could work.");
    if (blocks.length === 0) return setError("Pick at least one time of day.");
    setBusy(true);
    try {
      const { id, creatorKey } = await createHangout({
        title, creator: profile.name, note, days, blocks, places, expected,
        squadId: squadId || undefined, surprise, clientToken: profile.token,
      });
      remember(id, { creatorKey, name: profile.name });
      recordHangout({ id, title: title.trim(), role: "organizer" });
      nav(`/h/${id}?new=1`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="logo">🎈 Hangout</div>
        <div className="profile-row">
          <span className="face" title={profile.name}><Avatar seed={profile.seed} /></span>
          <span className="muted">
            Hey <b>{profile.name}</b>{" "}
            <button
              className="link-btn"
              onClick={() => { clearProfile(); onResetProfile(); }}
            >
              (log out)
            </button>
          </span>
        </div>
        <h1>Stop asking. Start hanging.</h1>
        <p>
          Make a plan, share one link. Friends tap when they're free,
          and Hangout picks the time and place. No 47-message group chat.
        </p>
      </header>

      <form className="card" onSubmit={submit}>
        {squadName && (
          <div className="squad-badge">👥 Planning with <b>{squadName}</b></div>
        )}
        <label className="field">
          <span>What's the hangout?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dinner + catch up 🍜"
            maxLength={80}
          />
        </label>

        <div className="field">
          <span>Which days could work?</span>
          <em className="hint">Tap several! The more days you give, the easier it is for everyone to match.</em>
          <div className="chip-row scroll">
            {candidates.map((d, i) => (
              <button
                type="button"
                key={d}
                className={`chip day ${days.includes(d) ? "on" : ""}`}
                onClick={() => toggle(days, setDays, d)}
              >
                <b>{i === 0 ? "Today" : i === 1 ? "Tmrw" : fmtDay(d).split(",")[0]}</b>
                <small>{fmtDay(d).replace(/^\w+, /, "")}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>What time of day?</span>
          <div className="chip-row">
            {BLOCKS.map((b) => (
              <button
                type="button"
                key={b.key}
                className={`chip block ${blocks.includes(b.key) ? "on" : ""}`}
                onClick={() => toggle(blocks, setBlocks, b.key)}
              >
                <b>{b.emoji} {b.label}</b>
                <small>{b.hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Place options <em>(optional, friends vote)</em></span>
          <div className="place-input">
            <input
              value={placeInput}
              onChange={(e) => setPlaceInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPlace())}
              placeholder="e.g. Thai place on 5th"
              maxLength={60}
            />
            <button type="button" className="btn small" onClick={() => addPlace()}>Add</button>
          </div>
          {places.length > 0 && (
            <div className="chip-row wrap">
              {places.map((p) => (
                <button
                  type="button"
                  key={p}
                  className="chip tag on removable"
                  onClick={() => setPlaces(places.filter((x) => x !== p))}
                >
                  {p} ✕
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span>How many people (including you)?</span>
          <div className="stepper">
            <button type="button" className="btn small" onClick={() => setExpected(Math.max(2, expected - 1))}>−</button>
            <b>{expected}</b>
            <button type="button" className="btn small" onClick={() => setExpected(Math.min(20, expected + 1))}>+</button>
          </div>
          <em className="hint">When everyone's answered, Hangout locks in the plan automatically.</em>
        </div>

        <button
          type="button"
          className={`chip tag surprise-toggle ${surprise ? "on" : ""}`}
          onClick={() => setSurprise(!surprise)}
        >
          🎲 Surprise mode: hide the winning spot until I reveal it
        </button>

        <label className="field">
          <span>Note <em>(optional)</em></span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="It's been too long!!"
            maxLength={200}
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button className="btn primary big" disabled={busy}>
          {busy ? "Creating…" : "Create & get the link 🎉"}
        </button>
      </form>

      <Assistant draft={{ title, expected }} onAddPlace={(name) => addPlace(name)} />

      <SquadsCard />

      <MyHangouts />

      <Nearby onPick={(name) => addPlace(name)} />

      <footer className="foot">Made for friend groups that never decide anything.</footer>
    </div>
  );
}
