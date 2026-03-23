#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    [
      "Usage:",
      "  node scraper/cc_scraper.js [options]",
      "",
      "Options:",
      "  --from-convo <path>                 Extract IDs from a CONVO.md-style capture",
      "  --flashcard-ids-file <path>         JSON file with flashcard IDs (array or {ids:[]})",
      "  --practice-ids-file <path>          JSON file with practice IDs (array or {ids:[]})",
      "  --keep-duplicates                   Keep duplicate IDs (default dedupes)",
      "  --batch-size <n>                    Override batch size (default from CC_BATCH_SIZE or 100)",
      "  --output-dir <path>                 Output directory (default from CC_OUTPUT_DIR or scraper/out)",
      "",
      "Auth env:",
      "  CC_COOKIE_HEADER                    Full Cookie header value to send",
      "  CC_SESSION_TOKEN                    Value for __Secure-next-auth.session-token",
      "  CC_JWT                              Value for jwt_token",
      "  CC_BASE_URL                         Default https://academy.citizencafetlv.com",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    fromConvo: undefined,
    flashcardIdsFile: undefined,
    practiceIdsFile: undefined,
    practiceSetsFile: undefined,
    keepDuplicates: false,
    batchSize: undefined,
    outputDir: undefined,
    discover: false,
    forceDiscover: false,
  };
  const a = [...argv];
  while (a.length) {
    const k = a.shift();
    if (k === "--from-convo") args.fromConvo = a.shift();
    else if (k === "--flashcard-ids-file") args.flashcardIdsFile = a.shift();
    else if (k === "--practice-ids-file") args.practiceIdsFile = a.shift();
    else if (k === "--practice-sets-file") args.practiceSetsFile = a.shift();
    else if (k === "--keep-duplicates") args.keepDuplicates = true;
    else if (k === "--batch-size") args.batchSize = parseInt(a.shift(), 10);
    else if (k === "--output-dir") args.outputDir = a.shift();
    else if (k === "--discover") args.discover = true;
    else if (k === "--force-discover") args.forceDiscover = true;
    else if (k === "-h" || k === "--help") return { help: true };
  }
  return args;
}

function getCookieHeader(env, baseUrl) {
  if (env.CC_COOKIE_HEADER && env.CC_COOKIE_HEADER.trim()) return env.CC_COOKIE_HEADER.trim();
  const parts = [];
  if (env.CC_SESSION_TOKEN) parts.push(`__Secure-next-auth.session-token=${env.CC_SESSION_TOKEN}`);
  if (env.CC_JWT) parts.push(`jwt_token=${env.CC_JWT}`);
  if (parts.length === 0) return undefined;
  return parts.join("; ");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed parsing JSON file: ${filePath}`);
  }
}

function readIdsFromFile(filePath) {
  const data = readJsonFile(filePath);
  if (Array.isArray(data)) return data.map(String);
  if (data && Array.isArray(data.ids)) return data.ids.map(String);
  throw new Error(`IDs file must be an array or { ids: [] }: ${filePath}`);
}

function readPracticeSetsFromFile(filePath) {
  const data = readJsonFile(filePath);
  if (!Array.isArray(data)) throw new Error(`Practice sets file must be an array: ${filePath}`);
  const sets = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const title = String(entry.title || entry.lesson_title || "lesson");
    const lesson_id = entry.lesson_id ? String(entry.lesson_id) : undefined;
    let ids = [];
    if (Array.isArray(entry.quiz_ids)) {
      ids = entry.quiz_ids.map((q) => String(q.quiz_learndash_id || q.id)).filter(Boolean);
    } else if (Array.isArray(entry.ids)) {
      ids = entry.ids.map(String);
    }
    if (ids.length) sets.push({ title, lesson_id, ids });
  }
  const allIds = uniqStable(sets.flatMap((s) => s.ids.map(String)));
  return { sets, allIds };
}

function uniqStable(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function extractFromConvo(convoPath) {
  const text = fs.readFileSync(convoPath, "utf8");
  const arrayMatches = [];
  const arrayRe = /\[(?:\s*"\d+"\s*,?\s*)+\]/g;
  let m;
  while ((m = arrayRe.exec(text)) !== null) {
    arrayMatches.push({ str: m[0], idx: m.index });
  }
  let flashcardIds = [];
  if (arrayMatches.length) {
    let best = arrayMatches[0];
    for (const c of arrayMatches) if (c.str.length > best.str.length) best = c;
    try {
      const parsed = JSON.parse(best.str);
      if (Array.isArray(parsed)) flashcardIds = parsed.map(String);
    } catch {}
  }
  let practiceIds = [];
  const practiceObjRe = /\{\s*"ids"\s*:\s*\[(?:\s*"\d+"\s*,?\s*)+\]\s*\}/g;
  const pMatch = practiceObjRe.exec(text);
  if (pMatch) {
    try {
      const parsed = JSON.parse(pMatch[0]);
      if (parsed && Array.isArray(parsed.ids)) practiceIds = parsed.ids.map(String);
    } catch {}
  }
  // Try to extract a Cookie header captured in the DevTools dump
  // Pattern: a line containing only 'cookie' followed by one long line of cookie string
  const cookieMatches = [];
  const cookieRe = /(?:^|\n)cookie\n([^\n]+)/gi;
  let cm;
  while ((cm = cookieRe.exec(text)) !== null) {
    cookieMatches.push(cm[1]);
  }
  // Pick the longest cookie string that contains either session token or jwt
  let cookieHeader = undefined;
  if (cookieMatches.length) {
    cookieMatches.sort((a, b) => b.length - a.length);
    for (const c of cookieMatches) {
      if (/__Secure-next-auth\.session-token=/.test(c) || /jwt_token=/.test(c)) {
        cookieHeader = c.trim();
        break;
      }
    }
    if (!cookieHeader) cookieHeader = cookieMatches[0].trim();
  }
  return { flashcardIds, practiceIds, cookieHeader };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJsonWithRetry(url, opts, { tries = 3, baseDelay = 500 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt < tries) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
        if (res.status >= 500 || res.status === 429) throw err;
        return Promise.reject(err);
      }
      const data = await res.json();
      return data;
    } catch (e) {
      lastErr = e;
      attempt++;
      if (attempt >= tries) break;
      const backoff = baseDelay * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function fetchTextWithRetry(url, opts, { tries = 3, baseDelay = 500 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt < tries) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
        if (res.status >= 500 || res.status === 429) throw err;
        return Promise.reject(err);
      }
      const data = await res.text();
      return data;
    } catch (e) {
      lastErr = e;
      attempt++;
      if (attempt >= tries) break;
      const backoff = baseDelay * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function buildHeaders(cookieHeader, baseUrl) {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Cookie": cookieHeader,
    "Origin": baseUrl,
    "Referer": baseUrl + "/my-course",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  };
}

async function hydrateFlashcards({ baseUrl, cookieHeader, ids, batchSize, keepDuplicates }) {
  const targetIds = keepDuplicates ? ids.map(String) : uniqStable(ids.map(String));
  const batches = chunk(targetIds, batchSize);
  const out = [];
  for (let i = 0; i < batches.length; i++) {
    const body = JSON.stringify({ ids: batches[i] });
    const data = await fetchJsonWithRetry(baseUrl + "/api/flashcards", {
      method: "POST",
      headers: buildHeaders(cookieHeader, baseUrl),
      body,
    });
    if (Array.isArray(data)) out.push(...data);
    else if (data && Array.isArray(data.data)) out.push(...data.data);
    await sleep(250);
  }
  return out;
}

async function hydratePractice({ baseUrl, cookieHeader, ids, batchSize, keepDuplicates }) {
  const targetIds = keepDuplicates ? ids.map(String) : uniqStable(ids.map(String));
  const batches = chunk(targetIds, batchSize);
  const out = [];
  for (let i = 0; i < batches.length; i++) {
    const body = JSON.stringify({ ids: batches[i] });
    const data = await fetchJsonWithRetry(baseUrl + "/api/practicetogo/question/ids", {
      method: "POST",
      headers: buildHeaders(cookieHeader, baseUrl),
      body,
    });
    if (Array.isArray(data)) out.push(...data);
    else if (data && Array.isArray(data.data)) out.push(...data.data);
    await sleep(250);
  }
  return out;
}

function normalizeFlashcards(cards) {
  return cards.map((c) => {
    const contents = Array.isArray(c?.contents) ? c.contents : [];
    const eng = contents.find((x) => x && x.type === "English")?.content;
    const heb = contents.find((x) => x && x.type === "Hebrew")?.content;
    return {
      id: String(c?.id ?? ""),
      lesson: c?.lesson ?? null,
      english: eng ?? null,
      hebrew: heb ?? null,
      contents,
    };
  });
}

function normalizePractice(items) {
  return items.map((q) => ({
    id: String(q?.id ?? ""),
    title: q?.title ?? null,
    type: q?.type ?? null,
    level: q?.level ?? null,
    lesson: q?.lesson ?? null,
    segment: q?.segment ?? null,
    question_text: q?.question_text ?? null,
    text_answer: q?.text_answer ?? null,
    question_audio_url: q?.question_audio_url ?? null,
    answer_audio_url: q?.answer_audio_url ?? null,
    created_at: q?.created_at ?? null,
    last_update: q?.last_update ?? null,
}));
}

function isFlashcardObject(obj) {
  return obj && typeof obj === "object" && Array.isArray(obj.contents);
}

function isPracticeObject(obj) {
  return obj && typeof obj === "object" && (typeof obj.type === "string" || obj.title);
}

function extractNextData(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>\s*([\s\S]*?)\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function gatherCandidateIdArrays(value, out = []) {
  try {
    if (Array.isArray(value)) {
      const numericStrArray = value.every((v) => typeof v === "string" && /^\d+$/.test(v));
      if (numericStrArray && value.length >= 5) out.push(value.map(String));
      for (const v of value) gatherCandidateIdArrays(v, out);
    } else if (value && typeof value === "object") {
      if (Array.isArray(value.ids) && value.ids.every((v) => typeof v === "string" && /^\d+$/.test(v))) {
        out.push(value.ids.map(String));
      }
      for (const k of Object.keys(value)) gatherCandidateIdArrays(value[k], out);
    }
  } catch {}
  return out;
}

async function sampleHydrateFlashcards({ baseUrl, cookieHeader, ids }) {
  try {
    const body = JSON.stringify({ ids });
    const data = await fetchJsonWithRetry(baseUrl + "/api/flashcards", {
      method: "POST",
      headers: buildHeaders(cookieHeader, baseUrl),
      body,
    });
    if (Array.isArray(data) && data.length && isFlashcardObject(data[0])) return data;
    if (data && Array.isArray(data.data) && data.data.length && isFlashcardObject(data.data[0])) return data.data;
  } catch {}
  return [];
}

async function sampleHydratePractice({ baseUrl, cookieHeader, ids }) {
  try {
    const body = JSON.stringify({ ids });
    const data = await fetchJsonWithRetry(baseUrl + "/api/practicetogo/question/ids", {
      method: "POST",
      headers: buildHeaders(cookieHeader, baseUrl),
      body,
    });
    if (Array.isArray(data) && data.length && isPracticeObject(data[0])) return data;
    if (data && Array.isArray(data.data) && data.data.length && isPracticeObject(data.data[0])) return data.data;
  } catch {}
  return [];
}

async function discoverIdsFromSite({ baseUrl, cookieHeader }) {
  const html = await fetchTextWithRetry(baseUrl + "/my-course", {
    method: "GET",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Cookie": cookieHeader,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      "Referer": baseUrl + "/",
    },
  });
  const nextData = extractNextData(html);
  const candidates = nextData ? gatherCandidateIdArrays(nextData) : [];
  const uniqueCandidates = [];
  const seen = new Set();
  for (const arr of candidates) {
    const key = JSON.stringify(uniqStable(arr));
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(arr);
    }
  }
  let flashcardIds = [];
  let practiceIds = [];
  for (const arr of uniqueCandidates.sort((a, b) => b.length - a.length)) {
    const sample = uniqStable(arr).slice(0, 10);
    if (!flashcardIds.length) {
      const fc = await sampleHydrateFlashcards({ baseUrl, cookieHeader, ids: sample });
      if (fc.length) {
        flashcardIds = uniqStable(arr);
        continue;
      }
    }
    if (!practiceIds.length) {
      const pr = await sampleHydratePractice({ baseUrl, cookieHeader, ids: sample });
      if (pr.length) {
        practiceIds = uniqStable(arr);
        continue;
      }
    }
    if (flashcardIds.length && practiceIds.length) break;
  }
  return { flashcardIds, practiceIds };
}

async function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  if (parsed.help) return usage();

  const baseUrl = process.env.CC_BASE_URL?.trim() || "https://academy.citizencafetlv.com";
  let cookieHeader = getCookieHeader(process.env, baseUrl);

  const outputDir = parsed.outputDir || process.env.CC_OUTPUT_DIR || path.join("scraper", "out");
  const batchSize = parsed.batchSize || (process.env.CC_BATCH_SIZE ? parseInt(process.env.CC_BATCH_SIZE, 10) : 100);
  const keepDuplicates = !!parsed.keepDuplicates;

  let flashcardIds = [];
  let practiceIds = [];
  let practiceSets = [];
  let convoCookies;

  if (parsed.fromConvo) {
    const extracted = extractFromConvo(parsed.fromConvo);
    flashcardIds = extracted.flashcardIds || [];
    practiceIds = extracted.practiceIds || [];
    convoCookies = extracted.cookieHeader;
  }

  if (!cookieHeader && convoCookies) {
    cookieHeader = convoCookies;
  }

  if (parsed.forceDiscover) {
    flashcardIds = [];
    practiceIds = [];
  }

  if (parsed.flashcardIdsFile) {
    const ids = readIdsFromFile(parsed.flashcardIdsFile);
    flashcardIds = ids;
  }
  if (parsed.practiceIdsFile) {
    const ids = readIdsFromFile(parsed.practiceIdsFile);
    practiceIds = ids;
  }
  if (parsed.practiceSetsFile) {
    const r = readPracticeSetsFromFile(parsed.practiceSetsFile);
    practiceSets = r.sets;
    if (!practiceIds.length) practiceIds = r.allIds;
  }

  if (!cookieHeader) {
    console.error("Missing cookies. Set CC_COOKIE_HEADER / CC_SESSION_TOKEN / CC_JWT, or provide --from-convo to extract cookies.");
    process.exit(1);
  }

  if ((!flashcardIds.length || !practiceIds.length) && parsed.discover) {
    console.log("Discovering IDs from site...");
    const d = await discoverIdsFromSite({ baseUrl, cookieHeader });
    if (!flashcardIds.length && d.flashcardIds?.length) flashcardIds = d.flashcardIds;
    if (!practiceIds.length && d.practiceIds?.length) practiceIds = d.practiceIds;
  }

  if (!flashcardIds.length && !practiceIds.length) {
    console.error("No IDs provided. Use --discover, --from-convo, or --flashcard-ids-file / --practice-ids-file.");
    process.exit(1);
  }

  ensureDir(outputDir);

  if (flashcardIds.length) {
    console.log(`Hydrating ${flashcardIds.length} flashcard IDs...`);
    const flashRaw = await hydrateFlashcards({ baseUrl, cookieHeader, ids: flashcardIds, batchSize, keepDuplicates });
    fs.writeFileSync(path.join(outputDir, "flashcards_raw.json"), JSON.stringify(flashRaw, null, 2));
    const flashNorm = normalizeFlashcards(flashRaw);
    fs.writeFileSync(path.join(outputDir, "flashcards_normalized.json"), JSON.stringify(flashNorm, null, 2));
    console.log(`Saved flashcards to ${path.join(outputDir, "flashcards_raw.json")} and flashcards_normalized.json`);
  }

  if (practiceIds.length) {
    if (practiceSets.length) {
      console.log(`Hydrating practice across ${practiceSets.length} sets (total ${practiceIds.length} unique IDs)...`);
      const combinedRaw = [];
      const index = [];
      for (let i = 0; i < practiceSets.length; i++) {
        const set = practiceSets[i];
        const setIds = uniqStable(set.ids.map(String));
        console.log(`  Set ${i + 1}/${practiceSets.length}: ${set.title} — ${setIds.length} IDs`);
        const setRaw = await hydratePractice({ baseUrl, cookieHeader, ids: setIds, batchSize, keepDuplicates });
        const setNorm = normalizePractice(setRaw);
        combinedRaw.push(...setRaw);
        const safeTitle = set.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || `lesson_${i+1}`;
        fs.writeFileSync(path.join(outputDir, `practice_raw.${i+1}_${safeTitle}.json`), JSON.stringify(setRaw, null, 2));
        fs.writeFileSync(path.join(outputDir, `practice_normalized.${i+1}_${safeTitle}.json`), JSON.stringify(setNorm, null, 2));
        index.push({ idx: i + 1, title: set.title, lesson_id: set.lesson_id, count: setNorm.length, ids: setIds });
      }
      const combinedNorm = normalizePractice(combinedRaw);
      fs.writeFileSync(path.join(outputDir, "practice_sets.index.json"), JSON.stringify(index, null, 2));
      fs.writeFileSync(path.join(outputDir, "practice_raw.json"), JSON.stringify(combinedRaw, null, 2));
      fs.writeFileSync(path.join(outputDir, "practice_normalized.json"), JSON.stringify(combinedNorm, null, 2));
      console.log(`Saved per-set practice files and consolidated outputs in ${outputDir}`);
    } else {
      console.log(`Hydrating ${practiceIds.length} practice IDs...`);
      const pracRaw = await hydratePractice({ baseUrl, cookieHeader, ids: practiceIds, batchSize, keepDuplicates });
      fs.writeFileSync(path.join(outputDir, "practice_raw.json"), JSON.stringify(pracRaw, null, 2));
      const pracNorm = normalizePractice(pracRaw);
      fs.writeFileSync(path.join(outputDir, "practice_normalized.json"), JSON.stringify(pracNorm, null, 2));
      console.log(`Saved practice to ${path.join(outputDir, "practice_raw.json")} and practice_normalized.json`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
