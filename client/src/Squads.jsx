import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createSquad, mySquads, getSquad, joinSquad, fmtDay, blockInfo } from "./api.js";
import { getProfile } from "./profile.js";
import Avatar from "./avatar.jsx";

const EMOJIS = ["🎈", "🔥", "👑", "🌙", "⚡", "🌊", "🎯", "🦋", "💎", "🍀"];

/* ---------- home screen card ---------- */

export function SquadsCard() {
  const profile = getProfile();
  const nav = useNavigate();
  const [squads, setSquads] = useState([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎈");
  const [error, setError] = useState("");

  useEffect(() => {
    mySquads(profile?.token).then((d) => setSquads(d.squads)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const make = async () => {
    setError("");
    try {
      const { id } = await createSquad({ token: profile?.token, name, emoji });
      nav(`/squad/${id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card">
      <h3>👥 Your squads</h3>
      {squads.length === 0 && !creating && (
        <p className="muted">Save your friend group once, then start hangouts with one tap. Flake meter and memory wall included.</p>
      )}
      {squads.length > 0 && (
        <div className="nearby-list">
          {squads.map((s) => (
            <Link className="spot" key={s.id} to={`/squad/${s.id}`}>
              <div className="s-info">
                <b>{s.emoji} {s.name}</b>
                <small>{s.members} member{s.members === 1 ? "" : "s"} · {s.hangouts} hangout{s.hangouts === 1 ? "" : "s"}</small>
              </div>
              <small className="muted">open</small>
            </Link>
          ))}
        </div>
      )}
      {creating ? (
        <>
          <div className="chip-row wrap">
            {EMOJIS.map((e) => (
              <button key={e} type="button" className={`chip tag ${emoji === e ? "on" : ""}`} onClick={() => setEmoji(e)}>{e}</button>
            ))}
          </div>
          <div className="place-input">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Squad name (the baddies, roomies...)" maxLength={40}
              onKeyDown={(e) => e.key === "Enter" && make()} />
            <button className="btn primary small" onClick={make}>Create</button>
          </div>
          {error && <div className="error">{error}</div>}
        </>
      ) : (
        <button className="btn ghost" onClick={() => setCreating(true)}>+ New squad</button>
      )}
    </div>
  );
}

/* ---------- squad page ---------- */

export default function SquadPage() {
  const { id } = useParams();
  const profile = getProfile();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => getSquad(id, profile?.token).then(setS).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (error) return (
    <div className="page center"><div className="card"><h2>😵 {error}</h2><Link className="btn primary" to="/">Home</Link></div></div>
  );
  if (!s) return <div className="page center"><div className="spinner" /></div>;

  const join = async () => {
    try { await joinSquad(id, profile?.token); load(); } catch (err) { alert(err.message); }
  };

  const share = async () => {
    const url = `${window.location.origin}/squad/${id}`;
    if (navigator.share) { try { await navigator.share({ title: s.name, url }); return; } catch {} }
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const best = s.leaderboard.find((l) => l.score != null);
  const worst = [...s.leaderboard].reverse().find((l) => l.score != null && l.flakes > 0);

  return (
    <div className="page">
      <header className="head">
        <Link to="/" className="logo small">🎈 Hangout</Link>
        <div className="tada">{s.emoji}</div>
        <h1>{s.name}</h1>
        <p className="byline">{s.members.length} member{s.members.length === 1 ? "" : "s"} · {s.hangouts.length} hangout{s.hangouts.length === 1 ? "" : "s"}</p>
      </header>

      <div className="card">
        <div className="faces">
          {s.members.map((m) => (
            <span className="face" key={m.id} title={m.name}>
              {m.seed ? <Avatar seed={m.seed} /> : m.name[0]?.toUpperCase()}
            </span>
          ))}
        </div>
        {s.isMember ? (
          <>
            <button className="btn primary big" onClick={() => nav(`/?squad=${s.id}&squadName=${encodeURIComponent(s.emoji + " " + s.name)}`)}>
              New hangout with {s.name} 🎈
            </button>
            <button className="btn ghost" onClick={share}>
              {copied ? "Link copied! 📋" : "Invite friends to this squad 📤"}
            </button>
          </>
        ) : (
          <button className="btn primary big" onClick={join}>Join {s.name} 🎉</button>
        )}
      </div>

      {s.leaderboard.some((l) => l.score != null) && (
        <div className="card">
          <h3>😤 Flake meter</h3>
          {best && <p className="muted tiny">⭐ Most reliable: <b>{best.name}</b>{worst && worst.name !== best.name ? <> · 😭 Biggest flake: <b>{worst.name}</b></> : null}</p>}
          <div className="nearby-list">
            {s.leaderboard.map((l) => (
              <div className="spot" key={l.name}>
                <div className="s-info">
                  <b>{l.name}</b>
                  <small>{l.committed} showed · {l.flakes} flaked</small>
                </div>
                <b className={l.score == null ? "muted" : l.score >= 80 ? "score-good" : l.score >= 50 ? "score-mid" : "score-bad"}>
                  {l.score == null ? "no data" : `${l.score}%`}
                </b>
              </div>
            ))}
          </div>
          <small className="muted tiny">Score = locked plans you stuck with. Bailing after the plan locks costs you.</small>
        </div>
      )}

      {s.memories.length > 0 && (
        <div className="card">
          <h3>📸 Memory wall</h3>
          <div className="memory-grid">
            {s.memories.map((m, i) => (
              <figure className="memory" key={i}>
                <img src={m.photo} alt={m.caption || m.title} loading="lazy" />
                <figcaption>{m.caption || m.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {s.hangouts.length > 0 && (
        <div className="card">
          <h3>History</h3>
          <div className="nearby-list">
            {s.hangouts.map((h) => (
              <Link className="spot" key={h.id} to={`/h/${h.id}`}>
                <div className="s-info">
                  <b>{h.title}</b>
                  <small>
                    {h.canceledAt ? "🚫 canceled" : h.decidedSlot
                      ? `✅ ${fmtDay(h.decidedSlot.split("|")[0])} ${blockInfo(h.decidedSlot.split("|")[1]).emoji}`
                      : "⏳ still deciding"}
                    {h.memoryCount > 0 ? ` · 📸 ${h.memoryCount}` : ""}
                  </small>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
