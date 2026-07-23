// Procedurally generated avatars — every seed produces a unique character.
// The avatar is "customized by AI" in onboarding: it derives from your name +
// the vibes you pick, so your character reflects you.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s = Math.imul(48271, s) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

const SKINS = ["#ffd5b8", "#f2b48c", "#d99e6a", "#b97a50", "#8d5a3b", "#6b4226"];
const BG = [
  ["#6c5ce7", "#8b7bff"], ["#ff7ab8", "#ffa8cc"], ["#4ade9e", "#7af0c0"],
  ["#ffd166", "#ffe29a"], ["#5cc8ff", "#8fdcff"], ["#ff8c66", "#ffb199"],
];
const HAIR = ["#1c1c28", "#3b2a20", "#5a3825", "#7b4a2d", "#b06c49", "#e8c07d", "#c94f7c", "#5b5bd6"];
const VIBE_PROPS = {
  food: "🍜", coffee: "☕", movies: "🎬", games: "🎮", outdoors: "🌲", sports: "🏀",
  shopping: "🛍️", music: "🎧", chill: "😌", adventure: "🧭", art: "🎨", study: "📚",
};

export function makeSeed(name, vibes = []) {
  return `${name.trim().toLowerCase()}|${[...vibes].sort().join(",")}`;
}

export default function Avatar({ seed, size = 42 }) {
  const r = rng(hash(seed || "someone"));
  const [bg1, bg2] = BG[Math.floor(r() * BG.length)];
  const skin = SKINS[Math.floor(r() * SKINS.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const hairStyle = Math.floor(r() * 4); // 0 none-ish, 1 swoop, 2 puff, 3 buns
  const eyeStyle = Math.floor(r() * 3); // dots, happy, wink
  const mouthStyle = Math.floor(r() * 3); // smile, open, smirk
  const vibe = seed?.includes("|") ? seed.split("|")[1].split(",")[0] : "";
  const prop = VIBE_PROPS[vibe] || "";
  const gid = `g${hash(seed || "x") % 100000}`;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="avatar">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bg1} />
          <stop offset="1" stopColor={bg2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
      {/* head */}
      <circle cx="50" cy="58" r="26" fill={skin} />
      {/* hair */}
      {hairStyle === 1 && <path d="M24 52 Q28 26 50 26 Q74 26 76 52 L76 44 Q70 30 50 30 Q30 30 24 46 Z" fill={hair} />}
      {hairStyle === 1 && <path d="M26 50 Q30 30 52 31 L46 40 Q32 42 28 54 Z" fill={hair} />}
      {hairStyle === 2 && <circle cx="50" cy="36" r="16" fill={hair} />}
      {hairStyle === 2 && <circle cx="34" cy="42" r="9" fill={hair} />}
      {hairStyle === 2 && <circle cx="66" cy="42" r="9" fill={hair} />}
      {hairStyle === 3 && <circle cx="30" cy="34" r="8" fill={hair} />}
      {hairStyle === 3 && <circle cx="70" cy="34" r="8" fill={hair} />}
      {hairStyle === 3 && <path d="M26 52 Q30 30 50 30 Q70 30 74 52 L74 46 Q66 32 50 32 Q34 32 26 48 Z" fill={hair} />}
      {hairStyle === 0 && <path d="M26 50 Q30 28 50 28 Q70 28 74 50 L74 44 Q68 32 50 32 Q32 32 26 46 Z" fill={hair} />}
      {/* eyes */}
      {eyeStyle === 0 && (<><circle cx="41" cy="56" r="3" fill="#1c1c28" /><circle cx="59" cy="56" r="3" fill="#1c1c28" /></>)}
      {eyeStyle === 1 && (<>
        <path d="M37 57 Q41 52 45 57" stroke="#1c1c28" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M55 57 Q59 52 63 57" stroke="#1c1c28" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </>)}
      {eyeStyle === 2 && (<>
        <circle cx="41" cy="56" r="3" fill="#1c1c28" />
        <path d="M55 56 L63 56" stroke="#1c1c28" strokeWidth="2.6" strokeLinecap="round" />
      </>)}
      {/* mouth */}
      {mouthStyle === 0 && <path d="M42 68 Q50 75 58 68" stroke="#1c1c28" strokeWidth="2.6" fill="none" strokeLinecap="round" />}
      {mouthStyle === 1 && <ellipse cx="50" cy="70" rx="5" ry="6" fill="#1c1c28" />}
      {mouthStyle === 2 && <path d="M45 70 Q52 73 58 67" stroke="#1c1c28" strokeWidth="2.6" fill="none" strokeLinecap="round" />}
      {/* blush */}
      <circle cx="34" cy="64" r="4" fill="#ff7ab8" opacity="0.45" />
      <circle cx="66" cy="64" r="4" fill="#ff7ab8" opacity="0.45" />
      {/* vibe prop */}
      {prop && <text x="78" y="30" fontSize="20" textAnchor="middle">{prop}</text>}
    </svg>
  );
}
