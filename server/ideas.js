// Hangout idea engine.
// Works out of the box with a curated local engine, personalized to the
// group's vibe tags, size, and time of day. If ANTHROPIC_API_KEY is set,
// it upgrades to fully AI-generated ideas via the Claude API.

export const VIBES = [
  "food", "coffee", "movies", "games", "outdoors", "sports",
  "shopping", "music", "chill", "adventure", "art", "study",
];

// Each idea: title, desc, tags it matches, time blocks it fits, group size fit
const IDEA_BANK = [
  { t: "Try a new restaurant none of you have been to", d: "Everyone drops one spot in the chat, spin a wheel, no vetoes allowed.", tags: ["food", "adventure"], blocks: ["afternoon", "evening"], min: 2, max: 12 },
  { t: "Potluck picnic", d: "Everyone brings one dish or snack — park, blanket, zero reservations needed.", tags: ["food", "outdoors", "chill"], blocks: ["morning", "afternoon"], min: 3, max: 20 },
  { t: "Café-hop and rank them", d: "Hit 2–3 coffee shops in one walk and rate them like judges on a cooking show.", tags: ["coffee", "food", "chill"], blocks: ["morning", "afternoon"], min: 2, max: 6 },
  { t: "Movie marathon with a theme", d: "Pick a trilogy or a terrible-movie theme. Blankets, snacks, commentary encouraged.", tags: ["movies", "chill"], blocks: ["evening", "night"], min: 2, max: 10 },
  { t: "Go see whatever's in theaters", d: "Lowest-effort classic. Bonus: everyone rates it out of 10 after.", tags: ["movies"], blocks: ["afternoon", "evening", "night"], min: 2, max: 10 },
  { t: "Board game / card game night", d: "Someone brings the games, someone brings snacks. Losers do dishes.", tags: ["games", "chill"], blocks: ["evening", "night"], min: 3, max: 8 },
  { t: "Video game tournament", d: "Bracket-style on whatever party game you own. Winner picks where you eat next time.", tags: ["games"], blocks: ["evening", "night"], min: 3, max: 8 },
  { t: "Sunrise or sunset hike", d: "Short trail, big view, group photo at the top. Bring water.", tags: ["outdoors", "adventure", "sports"], blocks: ["morning", "evening"], min: 2, max: 10 },
  { t: "Bike or walk a new neighborhood", d: "Pick a part of town nobody knows and just explore it. End at a food spot.", tags: ["outdoors", "adventure", "food"], blocks: ["morning", "afternoon"], min: 2, max: 8 },
  { t: "Pickup game at the park", d: "Basketball, soccer, volleyball — whatever you can scrape a ball together for.", tags: ["sports", "outdoors"], blocks: ["morning", "afternoon", "evening"], min: 4, max: 14 },
  { t: "Thrift store challenge", d: "Set a $10 budget: find the best, weirdest, or most cursed item. Group vote decides.", tags: ["shopping", "games", "adventure"], blocks: ["afternoon"], min: 2, max: 8 },
  { t: "Farmers market run", d: "Wander, sample everything, and cook something together with what you buy.", tags: ["shopping", "food", "outdoors"], blocks: ["morning", "afternoon"], min: 2, max: 6 },
  { t: "Live music at a local venue", d: "Find a cheap local show or open mic — small venues, big memories.", tags: ["music", "adventure"], blocks: ["evening", "night"], min: 2, max: 10 },
  { t: "Karaoke night", d: "Private room if you're shy, open stage if you're brave. No skips on group songs.", tags: ["music", "games"], blocks: ["evening", "night"], min: 3, max: 12 },
  { t: "Museum or gallery day", d: "Most museums have free or student days — split up, then show each other your favorite piece.", tags: ["art", "chill"], blocks: ["morning", "afternoon"], min: 2, max: 8 },
  { t: "Paint & snack night", d: "Cheap canvases, one YouTube tutorial, everyone paints the same thing. Compare disasters.", tags: ["art", "chill", "games"], blocks: ["evening", "night"], min: 3, max: 10 },
  { t: "Study session with snack breaks", d: "Library or café, phones in the middle, 50/10 pomodoro. Snacks are the reward.", tags: ["study", "coffee", "chill"], blocks: ["morning", "afternoon", "evening"], min: 2, max: 8 },
  { t: "Cook-off night", d: "Split into teams, one secret ingredient, everyone eats the results. Judge dramatically.", tags: ["food", "games"], blocks: ["evening"], min: 4, max: 10 },
  { t: "Bonfire / rooftop hang", d: "Fire pit or rooftop, snacks, music, and absolutely no agenda.", tags: ["chill", "outdoors", "music"], blocks: ["evening", "night"], min: 3, max: 15 },
  { t: "Mini road trip", d: "Pick somewhere under an hour away that none of you have been. Playlist required.", tags: ["adventure", "outdoors", "music"], blocks: ["morning", "afternoon"], min: 2, max: 6 },
];

const BLOCK_LABELS = { morning: "morning", afternoon: "afternoon", evening: "evening", night: "late night" };

export function localIdeas(hangout) {
  const groupSize = Math.max(hangout.responses.length, 2);
  const tagCounts = new Map();
  for (const r of hangout.responses) {
    for (const tag of r.interests || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  const block = hangout.decidedSlot ? hangout.decidedSlot.split("|")[1] : null;

  const scored = IDEA_BANK.map((idea) => {
    let score = 0;
    let matchedTags = [];
    for (const tag of idea.tags) {
      const c = tagCounts.get(tag) || 0;
      if (c > 0) matchedTags.push({ tag, c });
      score += c * 2;
    }
    if (block && idea.blocks.includes(block)) score += 3;
    if (groupSize >= idea.min && groupSize <= idea.max) score += 2;
    else score -= 2;
    return { idea, score, matchedTags };
  }).sort((a, b) => b.score - a.score);

  return scored.slice(0, 4).map(({ idea, matchedTags }) => {
    let why = "A crowd-pleaser for groups like yours.";
    if (matchedTags.length > 0) {
      const top = matchedTags.sort((a, b) => b.c - a.c)[0];
      why = `${top.c} of ${groupSize} of you are into ${top.tag}`;
      if (block && idea.blocks.includes(block)) why += ` — and it's perfect for the ${BLOCK_LABELS[block]}`;
      why += ".";
    } else if (block && idea.blocks.includes(block)) {
      why = `Great fit for the ${BLOCK_LABELS[block]}.`;
    }
    return { title: idea.t, description: idea.d, why };
  });
}

export async function aiIdeas(hangout) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const groupSize = hangout.responses.length;
  const tagCounts = {};
  for (const r of hangout.responses) {
    for (const tag of r.interests || []) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const block = hangout.decidedSlot ? hangout.decidedSlot.split("|")[1] : "not decided yet";

  const prompt = `You suggest hangout ideas for a group of friends. Reply with ONLY a JSON array of exactly 4 objects, each {"title": "...", "description": "...", "why": "..."}. Keep titles under 8 words, descriptions under 25 words, "why" under 15 words and personalized to this group's data.

Group: "${hangout.title}" — ${groupSize} people.
Time of day: ${block}.
What they're into (tag: how many picked it): ${JSON.stringify(tagCounts)}.
${hangout.note ? `Organizer's note: ${hangout.note}` : ""}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const ideas = JSON.parse(match[0]);
    if (!Array.isArray(ideas)) return null;
    return ideas
      .filter((i) => i.title && i.description)
      .slice(0, 4)
      .map((i) => ({ title: String(i.title), description: String(i.description), why: String(i.why || "") }));
  } catch {
    return null;
  }
}

export async function getIdeas(hangout) {
  const ai = await aiIdeas(hangout);
  if (ai && ai.length > 0) return { source: "ai", ideas: ai };
  return { source: "local", ideas: localIdeas(hangout) };
}

/* ---------- buddy assistant ---------- */

const KEYWORDS = {
  food: ["food", "eat", "hungry", "dinner", "lunch", "restaurant", "snack"],
  coffee: ["coffee", "cafe", "café", "boba", "tea", "matcha"],
  movies: ["movie", "film", "watch", "cinema", "theater"],
  games: ["game", "play", "board", "video", "tournament"],
  outdoors: ["outside", "outdoor", "park", "hike", "walk", "nature", "beach"],
  sports: ["sport", "basketball", "soccer", "volleyball", "gym", "run"],
  shopping: ["shop", "mall", "thrift", "buy", "market"],
  music: ["music", "concert", "karaoke", "show", "sing"],
  chill: ["chill", "relax", "lazy", "easy", "low key", "lowkey", "hang"],
  adventure: ["adventure", "new", "different", "spontaneous", "random", "explore"],
  art: ["art", "museum", "paint", "craft", "creative"],
  study: ["study", "homework", "exam", "finals", "work"],
};

function localAssistant(hangout, question, userVibes = [], nearby = [], history = []) {
  const q = (question || "").toLowerCase();

  // Follow-up questions ("which one?", "where exactly?") — answer directly
  // instead of spamming more generic suggestions.
  const isFollowUp =
    history.length > 1 &&
    /^(?:(?:ok|okay|well|so|but|and|then|yes|yeah|hmm|um|uh)[\s,]+)*(which|where|what|who|how|when)\b/.test(q.trim()) &&
    q.length < 80;

  if (isFollowUp) {
    if (nearby.length > 0) {
      // Try to match the question against real nearby places first
      const words = q.split(/\W+/).filter((w) => w.length > 3);
      const hits = nearby.filter((n) =>
        words.some((w) => n.name.toLowerCase().includes(w) || (n.kind || "").toLowerCase().includes(w))
      );
      const list = (hits.length > 0 ? hits : nearby).slice(0, 4);
      return {
        reply: hits.length > 0
          ? "Here's what matches near you:"
          : "I can't name that one specifically, but these are real spots mapped near you:",
        ideas: list.map((n) => ({
          title: `📍 ${n.name}`,
          description: n.kind ? `${n.kind[0].toUpperCase()}${n.kind.slice(1)}, near your location.` : "Near your location.",
        })),
      };
    }
    return {
      reply:
        "Straight answer: my built-in engine can't name specific places on its own. Tap 📡 Enable local intel below and I'll pull real spots around you — then ask me that again.",
      ideas: [],
    };
  }
  const wantCheap = /cheap|broke|budget|free|\$/.test(q);
  const matched = new Set(userVibes);
  for (const [tag, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => q.includes(w))) matched.add(tag);
  }
  for (const r of hangout.responses) for (const t of r.interests || []) matched.add(t);

  const groupSize = Math.max(hangout.responses.length, 2);
  const block = hangout.decidedSlot ? hangout.decidedSlot.split("|")[1] : null;

  let pool = IDEA_BANK.map((idea) => {
    let score = 0;
    for (const t of idea.tags) if (matched.has(t)) score += 2;
    if (block && idea.blocks.includes(block)) score += 2;
    if (groupSize >= idea.min && groupSize <= idea.max) score += 1;
    if (wantCheap && /free|cheap|\$10|potluck|park|walk/i.test(idea.t + idea.d)) score += 2;
    return { idea, score };
  }).sort((a, b) => b.score - a.score);

  let picks = pool.slice(0, 3).map(({ idea }) => ({ title: idea.t, description: idea.d }));

  // If we have real nearby places and the question is about where to go, lead with them
  const wantsPlace = /where|place|spot|restaurant|eat|cafe|café|coffee|near|around|go/.test(q);
  if (nearby.length > 0 && wantsPlace) {
    const spots = nearby.slice(0, 3).map((n) => ({
      title: `📍 ${n.name}`,
      description: n.kind ? `${n.kind[0].toUpperCase()}${n.kind.slice(1)} near you — verified in your area.` : "Near you — verified in your area.",
    }));
    picks = [...spots, ...picks].slice(0, 4);
    return {
      reply: `Scanning your sector... ${nearby.length} viable locations detected nearby. Top candidates:`,
      ideas: picks,
    };
  }

  const openers = [
    `Analysis complete. For "${hangout.title}" with ${groupSize} attendees, I'd recommend the following:`,
    `Running the numbers on your group's preferences... optimal options identified:`,
    `Certainly. Cross-referencing your group's vibe profile — these rank highest:`,
    `Scanning local possibilities... I've narrowed it to these:`,
  ];
  const opener = openers[(q.length + groupSize) % openers.length];
  return { reply: opener, ideas: picks };
}

export async function assistant(hangout, question, userVibes = [], nearby = [], history = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const groupSize = hangout.responses.length || 2;
    const tagCounts = {};
    for (const r of hangout.responses) for (const t of r.interests || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
    const block = hangout.decidedSlot ? hangout.decidedSlot.split("|")[1] : "not decided yet";
    const system = `You are JAX, a sleek futuristic assistant built into the Hangout app — think JARVIS from Iron Man: polished, confident, subtly witty. Answer the user's ACTUAL question directly — if they ask "which thrift store?", name specific options or say honestly what you'd need to know; never dodge a direct question with generic suggestions. Keep replies to 2-3 short sentences. Reply with ONLY JSON: {"reply": "...", "ideas": [{"title": "...", "description": "..."}]} with 0-3 ideas (omit ideas when the question doesn't call for them).

Group: "${hangout.title}", ${groupSize} people, time: ${block}.
Group interests: ${JSON.stringify(tagCounts)}.
This user's own vibes: ${JSON.stringify(userVibes)}.
${nearby.length > 0 ? `REAL places near the user right now (prefer these when they ask where to go — they are verified nearby): ${JSON.stringify(nearby)}.` : ""}`;

    const messages = [
      ...history.slice(-8).map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: String(h.text || "").slice(0, 500),
      })),
      { role: "user", content: (question || "").slice(0, 300) },
    ];

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
          max_tokens: 600,
          system,
          messages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.reply) {
            return {
              source: "ai",
              reply: String(parsed.reply),
              ideas: Array.isArray(parsed.ideas)
                ? parsed.ideas.slice(0, 3).map((i) => ({ title: String(i.title || ""), description: String(i.description || "") }))
                : [],
            };
          }
        }
      }
    } catch {}
  }
  return { source: "local", ...localAssistant(hangout, question, userVibes, nearby, history) };
}
