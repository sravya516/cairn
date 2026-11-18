// The offline "Ask Cairn" assistant.
//
// WHAT IT IS: a question-answering front end over the bundled content. It finds the most relevant passages and quotes them,
// word for word, with the guide, section, sources and a link. It also runs the calculators for number questions.
// WHAT IT IS NOT: a generative AI. It never writes or paraphrases advice, so it cannot invent a step, a number or a dose.
// If nothing relevant exists, it says so.
//
// Pure functions: no DOM, no network. Fully unit-testable in Node.

import { buildPassages, terms } from './passages.js';
import { synonymsOf, editDistanceLE1 } from '../search/engine.js';
import { emergencyIntent, medicineGuard, calcIntent, metaIntent, liveIntent } from './intents.js';

// Everyday wording -> words the guides use (given as plain words; converted to stems at load time).
const EXTRA_SYNONYM_GROUPS = [
  ['kid', 'child', 'children', 'toddler'], ['baby', 'infant', 'newborn'], ['elderly', 'older', 'senior', 'seniors'], ['pet', 'dog', 'cat', 'animal'],
  ['store', 'storage', 'stockpile'], ['safe', 'safety'], ['sick', 'ill', 'illness', 'disease'], ['hurt', 'injury', 'injured', 'injur'], ['cut', 'wound', 'laceration'],
  ['stop', 'control'], ['cold', 'freezing', 'freeze'], ['hot', 'heat'], ['leave', 'evacuate', 'evacuation'], ['bunker', 'shelter'],
  ['radiation', 'radiological', 'nuclear', 'fallout', 'radioactive'], ['shooter', 'violence', 'attack', 'gunman'], ['flu', 'pandemic', 'outbreak', 'virus', 'epidemic'],
  ['drink', 'drinking', 'drinkable'], ['dirty', 'contaminated', 'unsafe', 'polluted'], ['clean', 'purify', 'disinfect', 'treat', 'filter'], ['fridge', 'refrigerator'],
  ['phone', 'cell', 'mobile', 'smartphone'], ['charge', 'charging', 'recharge'], ['blackout', 'outage', 'power cut'], ['earthquake', 'quake'], ['wind', 'gale'],
  ['rotate', 'rotation', 'rotating'], ['prepare', 'preparation', 'preparing', 'preparedness'], ['evacuate', 'evacuation', 'evacuating'], ['filter', 'filtration', 'filtering'],
  ['electrocuted', 'electrocution', 'electric shock', 'electrical shock'], ['heimlich', 'abdominal thrusts', 'choking'], ['purify', 'purification', 'purifying'],
  ['disinfect', 'disinfection', 'sanitize'], ['dehydrate', 'dehydration'], ['contaminate', 'contamination', 'contaminated'], ['ventilate', 'ventilation'],
  ['toilet', 'latrine', 'bathroom', 'restroom'], ['scam', 'fraud', 'scams'], ['documents', 'paperwork', 'papers', 'identification'], ['bag', 'backpack', 'go-bag'],
  ['smoke', 'smoky', 'haze'], ['boat', 'boating', 'vessel'], ['trip', 'travel', 'traveling', 'abroad'], ['money', 'cash'], ['food', 'meal', 'eat'],
];

/** Everyday phrasings that mean a word the guides use: "make water safe" is "purify water". Applied to retrieval only. */
export function rephrase(question) {
  return String(question).replace(/\bmake ((?:\w+ ){0,3}?)(?:safe|drinkable|potable)(?: to drink| for drinking| to use)?\b/gi, (_, thing) => `purify ${thing}`);
}

/** What kind of answer is being asked for? Used to prefer action steps over background, preparation over recovery, and so on. */
export function questionKind(question) {
  const q = String(question).toLowerCase().replace(/[’']/g, '');
  const kinds = [];
  if (/\b(what (should|do|can|to|must) (i|we|you)|what to do|how (do|can|should|would|to) (i|we|you)|how to|steps to|what happens|what now)\b/.test(q)) kinds.push('action');
  if (/^(what is|what are|whats|define|explain|tell me about|what does)\b/.test(q)) kinds.push('define');
  if (/\b(prepare|preparing|preparation|prep|get ready|be ready|before)\b/.test(q)) kinds.push('prepare');
  if (/\b(after|afterward|afterwards|recover|recovery|clean ?up|aftermath|return(ing)? home)\b/.test(q)) kinds.push('after');
  if (/\b(supplies|what to (pack|stock|buy|bring)|what do i need|need to (pack|stock|buy|bring)|what \w+ (do|should|must) (i|we|you) (need|have|keep|pack|store|bring|collect|include|get|buy)|what (should|goes|go) (be )?in|what to include|what should i (pack|include|have)|checklist|kit|gear)\b/.test(q)) kinds.push('supplies');
  if (/\b(signs?|symptoms?|warning|how (do|can) i know|how to tell)\b/.test(q)) kinds.push('signs');
  if (/\bmistakes?\b/.test(q)) kinds.push('mistakes');
  if (/\b(during|while)\b/.test(q)) kinds.push('during');
  if (/\bhow (long|much|many|far|often|big|hot|cold|deep|fast|high|soon|close|wide)\b|\bhow many times\b/.test(q)) kinds.push('quantity');
  return kinds;
}

function sectionBoost(kinds, blk) {
  const h = (blk.heading || '').toLowerCase();
  if (!kinds.length) return blk.type === 'summary' ? 1.25 : blk.kind === 'checklist' ? 0.8 : 1;
  let m = 1;
  for (const k of kinds) {
    if (k === 'action') {
      const timed = kinds.includes('after') || kinds.includes('prepare') || kinds.includes('supplies');
      if (timed) continue;
      if (blk.kind === 'card') m *= blk.type === 'steps' ? 1.7 : 1.1;
      if (blk.type === 'ol' || blk.type === 'steps') m *= 1.12;
      if (/^during/.test(h)) m *= 1.7;
      else if (/steps|what to do|respond|if (you|there)|how to|first aid/.test(h)) m *= 1.08;
      if (/understanding|overview|summary|special considerations|common mistakes/.test(h)) m *= 0.75;
      if (/preparing|supplies required|warning signs|evacuation considerations|shelter considerations/.test(h) && !kinds.includes('prepare') && !kinds.includes('supplies')) m *= 0.8;
      if (blk.kind === 'checklist') m *= 0.6;
    } else if (k === 'define') {
      if (/understanding|overview|summary/.test(h)) m *= 1.8;
      if (blk.kind === 'card') m *= 0.8;
    } else if (k === 'prepare') {
      if (/preparing|prepare|before|preparation/.test(h)) m *= 1.4;
      if (blk.kind === 'card') m *= 0.8;
    } else if (k === 'after') {
      if (/afterward|after|recovery|returning|clean/.test(h)) m *= 1.4;
    } else if (k === 'supplies') {
      if (/suppl|what to (store|pack|collect|include)|kit|contents|stock|items|pack|core|include|collect/.test(h)) m *= 1.4;
      if (blk.kind === 'checklist') m *= 1.8; // checklists are the natural answer to "what do I need"
    } else if (k === 'signs') {
      if (/signs?|symptoms?|warning/.test(h)) m *= 1.4;
    } else if (k === 'mistakes') {
      if (/mistakes?/.test(h)) m *= 1.6;
    } else if (k === 'during') {
      if (/during/.test(h)) m *= 1.3;
    }
  }
  return m;
}

// Words that describe which section is wanted rather than the topic. They help ranking but a passage need not contain them.
const SOFT_TERMS = new Set(['supplies', 'supply', 'signs', 'sign', 'symptoms', 'symptom', 'mistakes', 'mistake', 'prepare', 'preparing', 'preparation', 'prep', 'after', 'afterward', 'recover', 'recovery',
  'during', 'before', 'kit', 'checklist', 'list', 'steps', 'step', 'procedure', 'instructions', 'warning', 'warnings', 'precautions', 'safety',
  // generic in an emergency app, or generic verbs of a how-to question
  'emergency', 'emergencies', 'disaster', 'disasters', 'build', 'create', 'use', 'put', 'set', 'take', 'go', 'give', 'keep', 'avoid', 'prevent', 'protect', 'stay', 'pack', 'include', 'contents', 'victim', 'victims'].flatMap((w) => terms(w)));

/** Short questions must match every content word; longer ones may miss a word or two. */
function requiredCoverageFor(counted, q) {
  const hard = counted.filter(Boolean).length || q.length;
  return hard <= 2 ? 1 : hard <= 4 ? 0.65 : 0.5;
}

const MIN_COVERAGE = 0.5;     // fraction of the question's content words a passage must cover
const MAX_RESULTS = 3;
const MAX_LIST_ITEMS = 8;
const MAX_PARAGRAPH = 700;

const k1 = 1.4, b = 0.6;

function trimParagraph(text) {
  if (text.length <= MAX_PARAGRAPH) return { text, cut: false };
  const cut = text.slice(0, MAX_PARAGRAPH);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return { text: (end > 200 ? cut.slice(0, end + 1) : cut.trimEnd()) + ' …', cut: true };
}

export function createAssistant({ content, calculators = [] }) {
  const blocks = buildPassages(content);

  // ---- index ------------------------------------------------------------------------------------------------------
  const postings = new Map();  // term -> [{ b, u, tf }]
  const unitOffset = [];       // block -> first global unit id
  let totalUnits = 0, totalLen = 0;
  for (const blk of blocks) {
    unitOffset.push(totalUnits);
    blk.units.forEach((unit, u) => {
      totalUnits++; totalLen += unit.len;
      for (const [t, tf] of unit.tf) {
        let list = postings.get(t);
        if (!list) postings.set(t, (list = []));
        list.push({ b: blk.id, u, tf });
      }
    });
  }
  const avgLen = totalLen / Math.max(1, totalUnits);
  const fieldVocab = new Set();
  for (const blk of blocks) for (const set of [blk.titleTerms, blk.headingTerms, blk.tagTerms]) for (const t of set) fieldVocab.add(t);
  const known = (t) => postings.has(t) || fieldVocab.has(t);
  // Words that are the TOPIC of some guide or card (appear in a title or tag), as opposed to words merely mentioned in passing.
  const topicVocab = new Set();
  for (const blk of blocks) for (const set of [blk.titleTerms, blk.tagTerms]) for (const t of set) topicVocab.add(t);
  const allTerms = [...new Set([...postings.keys(), ...fieldVocab])];
  const idf = (t) => Math.log(1 + totalUnits / ((postings.get(t)?.length || 0) + 0.5));

  const synonymMap = new Map();
  for (const group of EXTRA_SYNONYM_GROUPS) {
    const stems = group.flatMap((w) => terms(w));
    for (const a of stems) { if (!synonymMap.has(a)) synonymMap.set(a, new Set()); for (const c of stems) if (c !== a) synonymMap.get(a).add(c); }
  }

  function variantsOf(term) {
    const out = new Map([[term, 1]]);
    for (const s of synonymsOf(term)) if (!out.has(s)) out.set(s, 0.6);
    for (const s of synonymMap.get(term) || []) if (!out.has(s)) out.set(s, 0.6);
    // Word forms: rotat -> rotation, prepar -> preparation (long shared start, same word family)
    if (term.length >= 5) {
      for (const v of allTerms) {
        if (v === term || out.has(v) || Math.abs(v.length - term.length) > 6) continue;
        let cp = 0; while (cp < term.length && cp < v.length && term[cp] === v[cp]) cp++;
        if (cp >= 5 && cp >= Math.min(term.length, v.length) - 1) out.set(v, 0.7);
      }
    }
    // Comparatives and superlatives: safest -> safe, coldest -> cold, warmer -> warm
    for (const [suffix, cuts] of [['est', [3, 2]], ['er', [2, 1]]]) {
      if (term.length >= 5 && term.endsWith(suffix)) {
        for (const cut of cuts) {
          const base = term.slice(0, -cut);
          for (const cand of [base, base.length > 3 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : null]) if (cand && cand.length >= 3 && !out.has(cand)) out.set(cand, 0.8);
        }
      }
    }
    // Compounds: snowstorm -> snow + storm (both halves must be real words in the content)
    if (!postings.has(term) && term.length >= 8) {
      for (let i = 4; i <= term.length - 4; i++) {
        const a = term.slice(0, i), c = term.slice(i);
        if (known(a) && known(c)) { out.set(a, 0.5); out.set(c, 0.6); break; }
      }
    }
    // Typos: one edit away, only when the word is not known at all
    if (!known(term) && term.length >= 5) {
      let n = 0;
      for (const v of allTerms) if (Math.abs(v.length - term.length) <= 1 && editDistanceLE1(term, v)) { out.set(v, 0.7); if (++n >= 3) break; }
    }
    return [...out].filter(([t]) => known(t));
  }

  // ---- retrieval ------------------------------------------------------------------------------------------------------
  function retrieve(question) {
    const q = [...new Set(terms(rephrase(question)))];
    if (!q.length) return { q, results: [], counted: [], unknown: [] };
    const nQ = q.length;
    const kinds = questionKind(question);
    const variants = q.map(variantsOf); // computed once per question (typo search scans the vocabulary)
    const unitBest = new Map(); // global unit id -> Float32Array(nQ) best contribution per question term
    const blockFieldHits = new Map(); // block id -> array(nQ) field bonus
    const guideFieldBonus = new Map(); // guide/card href -> Float32Array(nQ)

    q.forEach((term, i) => {
      for (const [v, w] of variants[i]) {
        const weight = idf(v) * w;
        for (const { b: bi, u, tf } of postings.get(v) || []) {
          const unit = blocks[bi].units[u];
          const tfn = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (unit.len / avgLen)));
          const gid = unitOffset[bi] + u;
          let arr = unitBest.get(gid);
          if (!arr) unitBest.set(gid, (arr = new Float32Array(nQ)));
          arr[i] = Math.max(arr[i], weight * tfn);
        }
      }
    });

    // Field bonuses: a question word in the guide title / section heading / tags is a strong topic signal.
    const fieldBonus = (blk) => {
      const arr = new Float32Array(nQ);
      q.forEach((term, i) => {
        for (const [v, w] of variants[i]) {
          const wt = idf(v) * w;
          if (blk.titleTerms.has(v)) arr[i] = Math.max(arr[i], wt * 1.6);
          if (blk.headingTerms.has(v)) arr[i] = Math.max(arr[i], wt * 1.0);
          if (blk.tagTerms.has(v)) arr[i] = Math.max(arr[i], wt * 0.8);
        }
      });
      return arr;
    };

    const candidates = new Set();
    for (const gid of unitBest.keys()) {
      // find the block for this unit (binary search over offsets)
      let lo = 0, hi = unitOffset.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (unitOffset[mid] <= gid) lo = mid; else hi = mid - 1; }
      candidates.add(lo);
    }

    // A guide whose title or tags match the question makes ALL of its passages candidates (the steps may not repeat the topic word).
    for (const blk of blocks) {
      for (const vs of variants) {
        if (vs.some(([v]) => blk.titleTerms.has(v) || blk.tagTerms.has(v))) { candidates.add(blk.id); break; }
      }
    }

    const hard = q.map((t) => !SOFT_TERMS.has(t));
    // A word that exists nowhere in the content (e.g. "ankle") cannot be matched by any passage. Ignore it when another solid word (4+ letters)
    // carries the question and unknown words are the minority; otherwise a nonsense question would still match on one stray word.
    const unknown = q.map((_, i) => variants[i].length === 0);
    const knownHard = q.filter((t, i) => hard[i] && !unknown[i]);
    const solid = knownHard.some((t) => t.length >= 4 && topicVocab.has(t));
    const unknownHard = q.filter((t, i) => hard[i] && unknown[i]).length;
    const ignoreUnknown = solid && unknownHard > 0 && unknownHard <= knownHard.length;
    const counted = q.map((t, i) => hard[i] && !(ignoreUnknown && unknown[i]));
    const nHard = counted.filter(Boolean).length;
    const scored = [];
    for (const bi of candidates) {
      const blk = blocks[bi];
      const unitScores = [];
      const matched = new Set();
      blk.units.forEach((_, u) => {
        const arr = unitBest.get(unitOffset[bi] + u);
        if (!arr) return;
        let s = 0;
        arr.forEach((v, i) => { if (v > 0) { s += v; matched.add(i); } });
        unitScores.push(s);
      });
      unitScores.sort((x, y) => y - x);
      const body = (unitScores[0] || 0) + 0.3 * unitScores.slice(1, 4).reduce((a, c) => a + c, 0);
      const fb = fieldBonus(blk);
      let field = 0;
      fb.forEach((v, i) => { if (v > 0) { field += v; matched.add(i); } });
      const coverage = nHard ? [...matched].filter((i) => counted[i]).length / nHard : matched.size / nQ;
      let titleHits = 0;
      q.forEach((t, i) => { if (counted[i] && variants[i].some(([v]) => blk.titleTerms.has(v))) titleHits++; });
      const titleCov = nHard ? titleHits / nHard : 0;
      const numeric = kinds.includes('quantity') ? (blk.units.some((u) => /\d/.test(u.text)) ? 1.35 : 0.8) : 1;
      const score = (body + field) * blk.boost * sectionBoost(kinds, blk) * numeric * (1 + 0.6 * titleCov) * coverage ** 1.5;
      let bestUnit = 0, bestVal = -1;
      blk.units.forEach((_, u) => { const arr = unitBest.get(unitOffset[bi] + u); let v = arr ? arr.reduce((a, c) => a + c, 0) : 0; if (kinds.includes('quantity') && /\d/.test(blk.units[u].text)) v += 3; if (v > bestVal) { bestVal = v; bestUnit = u; } });
      if (nHard && coverage === 0) continue;
      scored.push({ blk, score, coverage, bestUnit, matchedTerms: matched });
    }
    scored.sort((x, y) => y.score - x.score);
    return { q, results: scored, counted, unknown };
  }

  function render(entry) {
    const { blk } = entry;
    let items = blk.items, truncated = false;
    if (blk.type === 'p' || blk.type === 'warn' || blk.type === 'tip' || blk.type === 'summary') {
      const t = trimParagraph(items.join(' '));
      items = [t.text]; truncated = t.cut;
    } else if (items.length > MAX_LIST_ITEMS) { items = items.slice(0, MAX_LIST_ITEMS); truncated = true; }
    return {
      kind: blk.kind, title: blk.title, heading: blk.heading, blockType: blk.type, label: blk.label, items, truncated,
      href: blk.href, guideHref: blk.guideHref, sources: blk.sources, updated: blk.updated, severity: blk.severity || null,
      highlight: entry.bestUnit < items.length && items.length > 1 ? entry.bestUnit : null,
      score: Math.round(entry.score * 100) / 100, coverage: Math.round(entry.coverage * 100) / 100,
    };
  }

  // ---- public API ----------------------------------------------------------------------------------------------------------
  function ask(rawQuestion) {
    const question = String(rawQuestion ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!question) return { type: 'none', question, suggestions: starterQuestions() };

    const meta = metaIntent(question);
    if (meta) return { type: meta, question };

    if (liveIntent(question)) return { type: 'none', question, live: true, suggestions: linksFor(['weather-radio']) };

    if (medicineGuard(question)) {
      return { type: 'guard', question, links: linksFor(['medication-storage-continuity', 'poisoning', 'anaphylaxis']) };
    }

    const em = emergencyIntent(question);
    if (em) {
      const cards = em.cards.map((id) => content.emergencyById?.get(id)).filter(Boolean).map((c) => ({
        id: c.id, title: c.title, summary: c.summary, steps: c.steps, dont: c.dont || [], warn: c.warn || [], href: `#/emergency/${c.id}`,
        guideHref: c.guide ? `#/guide/${c.guide}` : null, severity: c.severity,
      }));
      if (cards.length) return { type: 'emergency', question, cards };
    }

    const ci = calcIntent(question);
    if (ci) {
      const calc = calculators.find((c) => c.id === ci.id);
      if (calc) {
        const out = calc.compute({ ...calc.defaults(), ...ci.inputs });
        if (out.ok) {
          return {
            type: 'calc', question, calcId: calc.id, title: calc.title, href: `#/calc/${calc.id}`,
            lines: out.results.slice(0, 4).map((r) => ({ label: r.label, value: r.value, note: r.note || '' })),
            notes: out.notes.slice(0, 2), assumed: ci.assumed, assumptions: calc.assumptions.slice(0, 2),
          };
        }
      }
    }

    const { q, results, counted, unknown } = retrieve(question);
    const requiredCov = requiredCoverageFor(counted, q);
    const top = results[0];
    if (!top || top.coverage < requiredCov) {
      const loose = results.filter((r) => r.coverage > 0 && r.blk.kind !== 'checklist').slice(0, 6);
      const seen = new Set();
      const suggestions = [];
      for (const r of loose) { if (!seen.has(r.blk.href)) { seen.add(r.blk.href); suggestions.push({ title: r.blk.title.replace(/^Emergency Now: |^Checklist: /, ''), href: r.blk.href }); } if (suggestions.length >= 3) break; }
      return { type: 'none', question, suggestions: suggestions.length ? suggestions : starterQuestions().slice(0, 0), terms: q };
    }

    const picked = [top];
    const seenHref = new Set([top.blk.href]);
    for (const r of results.slice(1)) {
      if (picked.length >= MAX_RESULTS) break;
      if (r.coverage < requiredCov || r.score < top.score * 0.35) continue;
      if (seenHref.has(r.blk.href)) continue; // one passage per guide
      if (r.blk.kind === 'checklist' && picked.some((p) => p.blk.kind === 'checklist')) continue; // one checklist is enough
      seenHref.add(r.blk.href); picked.push(r);
    }
    const words = question.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
    const surface = (stem) => words.find((w) => terms(w)[0] === stem) || stem;
    const missing = top.coverage < 1 ? q.filter((t, i) => counted[i] && !top.matchedTerms.has(i)).map(surface) : [];
    return { type: 'passages', question, confidence: top.coverage >= 0.75 ? 'high' : 'medium', results: picked.map(render), terms: q, missing };
  }

  function linksFor(guideIds) {
    return guideIds.map((id) => content.guideById?.get(id)).filter(Boolean).map((g) => ({ title: g.title, href: `#/guide/${g.id}` }));
  }

  function starterQuestions() {
    return [
      'How much water do I need for 4 people for 5 days?', 'How do I make water safe to drink?', 'What should I do during an earthquake?',
      'How do I stop severe bleeding?', 'What is in a 72-hour kit?', 'What do I do after a nuclear explosion?',
      'How long will a 500 Wh battery run a 50 W fridge?', 'How do I stay safe from carbon monoxide?',
    ].map((text) => ({ title: text, ask: text }));
  }

  /** Ranked passages with scores, for tuning and tests. */
  function explain(question, n = 15) {
    return retrieve(question).results.slice(0, n).map((r) => ({ title: r.blk.title, heading: r.blk.heading, type: r.blk.type, score: Math.round(r.score * 100) / 100, coverage: r.coverage }));
  }

  return { ask, explain, starterQuestions, stats: { blocks: blocks.length, units: totalUnits, terms: postings.size } };
}
