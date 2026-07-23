import { useEffect, useRef, useState } from "react";
import { addMemory, getMemories, BLOCK_START, fmtDay, blockInfo } from "./api.js";

/* ---------- countdown + hype ---------- */

const HYPE = [
  "Hydrate accordingly.",
  "Outfit planning may commence.",
  "Cancel your other plans. You have plans.",
  "The group chat has earned this.",
  "Attendance is legally binding (emotionally).",
  "Do not flake. The meter is watching.",
];

export function Countdown({ h }) {
  const [date, block] = h.decidedSlot.split("|");
  const start = new Date(`${date}T${String(BLOCK_START[block] || 17).padStart(2, "0")}:00:00`);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = start.getTime() - now;
  const hype = HYPE[(h.id.charCodeAt(0) + new Date(now).getDate()) % HYPE.length];

  if (diff <= 0 && diff > -6 * 3600 * 1000) {
    return (
      <div className="countdown live-now">
        <b>IT'S HAPPENING 🎉</b>
        <small>Drop a photo below for the memory wall.</small>
      </div>
    );
  }
  if (diff <= 0) return null;

  const d = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const min = Math.floor((diff % 3600000) / 60000);
  const sec = Math.floor((diff % 60000) / 1000);

  return (
    <div className="countdown">
      <div className="cd-digits">
        {d > 0 && <span><b>{d}</b><small>d</small></span>}
        <span><b>{hrs}</b><small>h</small></span>
        <span><b>{min}</b><small>m</small></span>
        <span><b>{sec}</b><small>s</small></span>
      </div>
      <small className="muted">JAX: {hype}</small>
    </div>
  );
}

/* ---------- memory wall ---------- */

function compressImage(file, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function MemoryWall({ h, myName }) {
  const [memories, setMemories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef(null);

  const load = () => getMemories(h.id).then((d) => setMemories(d.memories)).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [h.id]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const photo = await compressImage(file);
      await addMemory(h.id, { photo, caption, name: myName || "someone" });
      setCaption("");
      load();
    } catch (err) {
      alert(err.message || "Upload failed, try a smaller photo.");
    }
    setBusy(false);
  };

  return (
    <div className="card">
      <h3>📸 Memory wall</h3>
      {memories.length === 0 && <p className="muted">No photos yet. First one sets the vibe.</p>}
      {memories.length > 0 && (
        <div className="memory-grid">
          {memories.map((m, i) => (
            <figure className="memory" key={i}>
              <img src={m.photo} alt={m.caption || "memory"} loading="lazy" />
              <figcaption>{m.caption || m.user_name}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (optional)"
        maxLength={120}
      />
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => upload(e.target.files?.[0])} />
      <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Uploading…" : "+ Add a photo"}
      </button>
    </div>
  );
}

/* ---------- recap card (canvas → shareable PNG) ---------- */

export function RecapButton({ h, going, memories }) {
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      const [date, block] = h.decidedSlot.split("|");
      const info = blockInfo(block);
      const W = 1080, H = 1920;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");

      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#12122a");
      g.addColorStop(0.5, "#0c0c14");
      g.addColorStop(1, "#1c1030");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = "center";
      ctx.fillStyle = "#8b7bff";
      ctx.font = "bold 56px Arial, sans-serif";
      ctx.fillText("🎈 HANGOUT RECAP", W / 2, 180);

      ctx.fillStyle = "#f2f1fa";
      ctx.font = "bold 88px Arial, sans-serif";
      const title = h.title.length > 22 ? h.title.slice(0, 21) + "…" : h.title;
      ctx.fillText(title, W / 2, 320);

      ctx.fillStyle = "#9c9ab8";
      ctx.font = "52px Arial, sans-serif";
      ctx.fillText(`${fmtDay(date, { long: true })} · ${info.emoji} ${info.label}`, W / 2, 410);
      if (h.decidedPlace) ctx.fillText(`📍 ${h.decidedPlace}`, W / 2, 490);

      // photo (first memory) or big emoji
      // rounded-rect path drawn manually: ctx.roundRect is missing on older iPhones
      const roundedPath = (x, y, w2, h2, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w2, y, x + w2, y + h2, r);
        ctx.arcTo(x + w2, y + h2, x, y + h2, r);
        ctx.arcTo(x, y + h2, x, y, r);
        ctx.arcTo(x, y, x + w2, y, r);
        ctx.closePath();
      };

      if (memories?.length > 0) {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const size = 820;
            const x = (W - size) / 2, y = 580;
            ctx.save();
            roundedPath(x, y, size, size, 48);
            ctx.clip();
            const scale = Math.max(size / img.width, size / img.height);
            ctx.drawImage(img, x + (size - img.width * scale) / 2, y + (size - img.height * scale) / 2, img.width * scale, img.height * scale);
            ctx.restore();
            resolve();
          };
          img.onerror = resolve;
          img.src = memories[0].photo;
        });
      } else {
        ctx.font = "300px Arial";
        ctx.fillText("🎉", W / 2, 1050);
      }

      ctx.fillStyle = "#f2f1fa";
      ctx.font = "bold 54px Arial, sans-serif";
      ctx.fillText(`${going.length} pulled up:`, W / 2, 1540);
      ctx.fillStyle = "#9c9ab8";
      ctx.font = "46px Arial, sans-serif";
      const names = going.map((r) => r.name).join(" · ");
      ctx.fillText(names.length > 40 ? names.slice(0, 39) + "…" : names, W / 2, 1610);

      ctx.fillStyle = "#5cc8ff";
      ctx.font = "40px Arial, sans-serif";
      ctx.fillText(`made with Hangout · ${window.location.host}`, W / 2, 1830);

      const url = c.toDataURL("image/png");
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "hangout-recap.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: h.title }); setBusy(false); return; } catch {}
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = "hangout-recap.png";
      a.click();
    } catch {
      alert("Couldn't build the recap card, try again.");
    }
    setBusy(false);
  };

  return (
    <button className="btn ghost" onClick={make} disabled={busy}>
      {busy ? "Building…" : "📸 Share recap card"}
    </button>
  );
}
