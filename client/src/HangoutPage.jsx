import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  getHangout, respond, decideNow, cancelHangout, editHangout, getIdeas, calendarUrl,
  remember, recall, BLOCKS, VIBES, fmtDay, blockInfo,
} from "./api.js";
import { recordHangout } from "./profile.js";
import Avatar from "./avatar.jsx";
import Assistant from "./Assistant.jsx";
import Nearby from "./Nearby.jsx";

export default function HangoutPage({ profile }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const [h, setH] = useState(null);
  const [error, setError] = useState("");
  const me = recall(id);

  const load = useCallback(async () => {
    try {
      const data = await getHangout(id);
      setH(data);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  // remember this hangout in "My hangouts"
  useEffect(() => {
    if (h) recordHangout({ id: h.id, title: h.title, role: me.creatorKey ? "organizer" : "member" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h?.id, h?.title]);

  if (error) {
    return (
      <div className="page center">
        <div className="card">
          <h2>😵 {error}</h2>
          <Link className="btn primary" to="/">Make a new hangout</Link>
        </div>
      </div>
    );
  }
  if (!h) return <div className="page center"><div className="spinner" /></div>;

  if (h.canceledAt) return <Canceled h={h} />;
  return h.decidedSlot
    ? <Decided h={h} />
    : <Open h={h} me={me} isNew={isNew} setH={setH} profile={profile} />;
}

/* ---------- share helpers ---------- */

function ShareCard({ title, text }) {
  const [copied, setCopied] = useState(false);
  const url = window.location.origin + window.location.pathname;
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="btn primary big" onClick={share}>
      {copied ? "Link copied! 📋" : "Share the link 📤"}
    </button>
  );
}

function Faces({ responses, expected }) {
  return (
    <div className="faces">
      {responses.map((r) => (
        <span className="face" key={r.name} title={r.name}>
          {r.avatar ? <Avatar seed={r.avatar} /> : r.name.trim()[0]?.toUpperCase()}
        </span>
      ))}
      {expected > responses.length &&
        Array.from({ length: expected - responses.length }).map((_, i) => (
          <span className="face empty" key={`e${i}`}>?</span>
        ))}
    </div>
  );
}

/* ---------- canceled ---------- */

function Canceled({ h }) {
  return (
    <div className="page center">
      <div className="card decided-card">
        <div className="tada">🫥</div>
        <h1>Canceled</h1>
        <p className="muted">“{h.title}” was called off by {h.creator}. It happens.</p>
        <Link className="btn primary big" to="/">Plan something else 🎈</Link>
      </div>
    </div>
  );
}

/* ---------- edit panel ---------- */

function localISO(d) {
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

function EditPanel({ h, me, onSaved, onClose }) {
  const dayOptions = useMemo(
    () => [...new Set([...nextDays(14), ...h.days])].sort(),
    [h.days]
  );
  const [title, setTitle] = useState(h.title);
  const [note, setNote] = useState(h.note || "");
  const [days, setDays] = useState(h.days);
  const [blocks, setBlocks] = useState(h.blocks);
  const [places, setPlaces] = useState(h.places);
  const [placeInput, setPlaceInput] = useState("");
  const [expected, setExpected] = useState(h.expected || 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (list, setList, v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const addPlace = () => {
    const p = placeInput.trim();
    if (p && !places.includes(p) && places.length < 8) setPlaces([...places, p]);
    setPlaceInput("");
  };

  const save = async () => {
    setError("");
    if (!title.trim()) return setError("The hangout needs a name.");
    if (days.length === 0) return setError("Keep at least one day.");
    if (blocks.length === 0) return setError("Keep at least one time of day.");
    setBusy(true);
    try {
      const updated = await editHangout(h.id, {
        creatorKey: me.creatorKey, title, note, days, blocks, places, expected,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="card edit-panel">
      <h3>✏️ Edit hangout</h3>
      <label className="field">
        <span>Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </label>
      <div className="field">
        <span>Days</span>
        <div className="chip-row scroll">
          {dayOptions.map((d) => (
            <button
              type="button" key={d}
              className={`chip day ${days.includes(d) ? "on" : ""}`}
              onClick={() => toggle(days, setDays, d)}
            >
              <b>{fmtDay(d).split(",")[0]}</b>
              <small>{fmtDay(d).replace(/^\w+, /, "")}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Times of day</span>
        <div className="chip-row">
          {BLOCKS.map((b) => (
            <button
              type="button" key={b.key}
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
        <span>Place options</span>
        <div className="place-input">
          <input
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPlace())}
            placeholder="Add a spot"
            maxLength={60}
          />
          <button type="button" className="btn small" onClick={addPlace}>Add</button>
        </div>
        {places.length > 0 && (
          <div className="chip-row wrap">
            {places.map((p) => (
              <button
                type="button" key={p}
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
        <span>Group size</span>
        <div className="stepper">
          <button type="button" className="btn small" onClick={() => setExpected(Math.max(2, expected - 1))}>−</button>
          <b>{expected}</b>
          <button type="button" className="btn small" onClick={() => setExpected(Math.min(20, expected + 1))}>+</button>
        </div>
      </div>
      <label className="field">
        <span>Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="btn primary big" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save changes ✅"}
      </button>
      <button className="btn ghost" onClick={onClose}>Never mind</button>
      <small className="muted tiny">
        Heads up: removing days, times, or places also removes them from answers friends already gave.
      </small>
    </div>
  );
}

/* ---------- open (still collecting) ---------- */

function Open({ h, me, isNew, setH, profile }) {
  const myName = me.name || profile?.name;
  const alreadyIn = h.responses.some((r) => r.name === myName);
  const mine = h.responses.find((r) => r.name === myName);
  const [editing, setEditing] = useState(false);
  const [editingHangout, setEditingHangout] = useState(false);
  const [name, setName] = useState(myName || "");
  const [slots, setSlots] = useState(mine ? mine.slots : []);
  const [placeVote, setPlaceVote] = useState(mine?.placeVote || "");
  const [interests, setInterests] = useState(mine?.interests || profile?.vibes || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isCreator = Boolean(me.creatorKey);

  const toggleSlot = (s) =>
    setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s]);
  const toggleInterest = (v) =>
    setInterests(interests.includes(v) ? interests.filter((x) => x !== v) : [...interests, v].slice(0, 6));

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("Add your name first!");
    if (slots.length === 0) return setError("Tap at least one time you're free.");
    setBusy(true);
    try {
      const updated = await respond(h.id, {
        name, slots, placeVote, interests,
        avatar: profile?.seed || "",
        clientToken: profile?.token || "",
      });
      remember(h.id, { ...me, name: updated.youAre || name.trim() });
      setH(updated);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const lockIn = async () => {
    if (!confirm("Lock in the plan now with the answers so far?")) return;
    try {
      setH(await decideNow(h.id, me.creatorKey));
    } catch (err) {
      alert(err.message);
    }
  };

  const cancel = async () => {
    if (!confirm(`Cancel “${h.title}” for everyone? This can't be undone.`)) return;
    try {
      setH(await cancelHangout(h.id, me.creatorKey));
    } catch (err) {
      alert(err.message);
    }
  };

  const showForm = !alreadyIn || editing;

  return (
    <div className="page">
      <header className="head">
        <Link to="/" className="logo small">🎈 Hangout</Link>
        <h1>{h.title}</h1>
        <p className="byline">{h.creator} is rallying the group{h.note ? ` — “${h.note}”` : ""}</p>
      </header>

      <div className="card progress-card">
        <div className="progress-line">
          <b>{h.responses.length}{h.expected ? ` of ${h.expected}` : ""} in</b>
          {h.expected > 0 && <span className="muted"> — plan locks automatically when everyone's answered</span>}
        </div>
        <Faces responses={h.responses} expected={h.expected} />
        {isNew && !alreadyIn && (
          <p className="muted">You made this hangout — now add your own availability 👇</p>
        )}
      </div>

      {editingHangout && (
        <EditPanel h={h} me={me} onSaved={setH} onClose={() => setEditingHangout(false)} />
      )}

      {showForm ? (
        <div className="card">
          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who are you?" maxLength={40} />
          </label>

          <div className="field">
            <span>Tap every time you're free</span>
            <div className="grid" style={{ "--cols": h.blocks.length }}>
              <div className="g-corner" />
              {h.blocks.map((b) => {
                const info = blockInfo(b);
                return <div className="g-head" key={b}>{info.emoji}<small>{info.label}</small></div>;
              })}
              {h.days.map((d) => (
                <GridRow key={d} d={d} h={h} slots={slots} toggleSlot={toggleSlot} />
              ))}
            </div>
          </div>

          {h.places.length > 0 && (
            <div className="field">
              <span>Vote for a spot</span>
              <div className="chip-row wrap">
                {h.places.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip tag ${placeVote === p ? "on" : ""}`}
                    onClick={() => setPlaceVote(placeVote === p ? "" : p)}
                  >
                    📍 {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <span>What are you in the mood for? <em>(helps pick the plan)</em></span>
            <div className="chip-row wrap">
              {VIBES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={`chip tag ${interests.includes(v.key) ? "on" : ""}`}
                  onClick={() => toggleInterest(v.key)}
                >
                  {v.emoji} {v.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          <button className="btn primary big" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : alreadyIn ? "Update my answer ✅" : "I'm in — save my times ✅"}
          </button>
        </div>
      ) : (
        <div className="card">
          <h3>You're in as {myName} ✅</h3>
          <p className="muted">Waiting on the rest of the group…</p>
          <button className="btn ghost" onClick={() => setEditing(true)}>Change my answer</button>
        </div>
      )}

      <Assistant hangout={h} />

      <div className="card">
        <h3>Get everyone in</h3>
        <p className="muted">Send this link to the group chat — no app or account needed to answer.</p>
        <ShareCard title={h.title} text={`When are you free for “${h.title}”? Tap your times:`} />
        {isCreator && h.responses.length > 0 && (
          <button className="btn ghost" onClick={lockIn}>
            ⚡ Don't wait — lock in the plan now
          </button>
        )}
      </div>

      {isCreator && (
        <div className="card organizer-tools">
          <h3>Organizer tools</h3>
          <div className="tool-row">
            <button className="btn ghost" onClick={() => setEditingHangout(true)}>✏️ Edit hangout</button>
            <button className="btn ghost danger" onClick={cancel}>🚫 Cancel it</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GridRow({ d, h, slots, toggleSlot }) {
  return (
    <>
      <div className="g-day">{fmtDay(d)}</div>
      {h.blocks.map((b) => {
        const s = `${d}|${b}`;
        return (
          <button
            key={s}
            type="button"
            className={`g-cell ${slots.includes(s) ? "on" : ""}`}
            onClick={() => toggleSlot(s)}
            aria-label={`${fmtDay(d)} ${b}`}
          >
            {slots.includes(s) ? "✓" : ""}
          </button>
        );
      })}
    </>
  );
}

/* ---------- decided ---------- */

function Decided({ h }) {
  const [date, block] = h.decidedSlot.split("|");
  const info = blockInfo(block);
  const going = h.responses.filter((r) => r.slots.includes(h.decidedSlot));
  const [ideas, setIdeas] = useState(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const fetched = useRef(false);

  const loadIdeas = async () => {
    setIdeasBusy(true);
    try { setIdeas(await getIdeas(h.id)); } catch {}
    setIdeasBusy(false);
  };
  useEffect(() => {
    if (!fetched.current) { fetched.current = true; loadIdeas(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <header className="head">
        <Link to="/" className="logo small">🎈 Hangout</Link>
        <div className="tada">🎉</div>
        <h1>It's happening!</h1>
        <p className="byline">{h.title}</p>
      </header>

      <div className="card decided-card">
        <div className="when">
          <b>{fmtDay(date, { long: true })}</b>
          <span>{info.emoji} {info.label} <em>({info.hint})</em></span>
        </div>
        {h.decidedPlace && <div className="where">📍 {h.decidedPlace}</div>}
        <Faces responses={going} expected={0} />
        <div className="who">
          <span className="muted">
            {going.length === h.responses.length
              ? `All ${going.length} can make it`
              : `${going.length} of ${h.responses.length} can make it`}
            : {going.map((r) => r.name).join(", ")}
          </span>
        </div>
        <a className="btn primary big" href={calendarUrl(h.id)}>📅 Add to calendar</a>
        <ShareCard title={h.title} text={`Locked in: ${h.title} — ${fmtDay(date, { long: true })}, ${info.label}.`} />
      </div>

      <Assistant hangout={h} />

      <div className="card">
        <h3>✨ Ideas for the hang</h3>
        {ideasBusy && <div className="spinner small" />}
        {ideas && (
          <>
            <div className="ideas">
              {ideas.ideas.map((i) => (
                <div className="idea" key={i.title}>
                  <b>{i.title}</b>
                  <p>{i.description}</p>
                  {i.why && <small>💡 {i.why}</small>}
                </div>
              ))}
            </div>
            <button className="btn ghost" onClick={loadIdeas} disabled={ideasBusy}>
              Shuffle ideas 🔀
            </button>
          </>
        )}
      </div>

      <Nearby />

      <div className="card">
        <Link to="/" className="btn primary big">Plan another hangout 🎈</Link>
      </div>
    </div>
  );
}
