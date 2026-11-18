// Rule-based intents for the offline assistant. No AI model: plain, testable patterns.
//   1. emergencyIntent: an urgent-sounding question gets Call 911 and the matching Emergency Now card FIRST.
//   2. medicineGuard:   questions about medicine doses are not answered; the user is pointed to a pharmacist, Poison Help or 911.
//   3. calcIntent:      "how much water for 4 people for 5 days" runs the real calculator.
//   4. greeting / help.

const norm = (q) => String(q || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9.+\s/-]/g, ' ').replace(/\s+/g, ' ').trim();

// ---- 1. Emergency triage -------------------------------------------------------------------------------------
// Each rule maps wording to Emergency Now card ids (see src/data/emergency). Conservative: showing Call 911 extra is harmless.
export const EMERGENCY_RULES = [
  { re: /\b(not|isnt|isnt|stopped|stop|no) (breathing|breathe)\b|\bunresponsive\b|\bunconscious\b|\bpassed out\b|\bcollapsed\b|\bno pulse\b|\bcardiac arrest\b|\bcpr\b|\bheart stopped\b/, cards: ['cpr'] },
  { re: /\b(bleeding|bleed|blood)\b.*\b(wont stop|heavily|badly|a lot|everywhere|severe|spurting|gushing)\b|\b(wont stop|severe|heavy)\b.*\b(bleeding|blood)\b|\bstabbed\b|\bgunshot\b|\bsevered\b|\btourniquet\b|\bhemorrhag/, cards: ['bleeding'] },
  { re: /\bchoking\b|\bchoked\b|\bcant (breathe|speak|talk|cough)\b.*\b(food|swallow|throat)\b|\bswallowed\b.*\b(stuck|wrong)\b/, cards: ['choking'] },
  { re: /\banaphyla|\ballergic reaction\b|\bthroat (is )?(swelling|closing)\b|\bswelling (of )?(the )?(throat|tongue|face)\b|\bepipen\b|\bhives\b.*\b(breath|swell)/, cards: ['anaphylaxis'] },
  { re: /\bheart attack\b|\bchest (pain|pressure|tightness)\b|(?<!\bheat )(?<!\bsun )\bstroke\b|\bface (is )?droop|\bslurred speech\b|\barm (is )?(weak|numb)\b/, cards: ['stroke-heart'] },
  { re: /\boverdos|\bpoison|\bswallowed (bleach|pills|cleaner|chemical|battery)|\bingested\b/, cards: ['poisoning'] },
  { re: /\bdrown|\bpulled (him|her|them|a child|someone) (out of|from) (the )?(water|pool|lake|river)|\bunder ?water\b.*\b(not|isnt) breathing\b/, cards: ['drowning'] },
  { re: /\bseizure|\bconvuls|\bepilep|\bhaving a fit\b/, cards: ['seizure'] },
  { re: /\bcant breathe\b|\btrouble breathing\b|\bshort(ness)? of breath\b|\bstruggling to breathe\b|\bwheez|\basthma attack\b/, cards: ['asthma', 'anaphylaxis', 'choking'] },
  { re: /\bdiabetic\b.*\b(confused|shaky|passed|unconscious|low)\b|\blow blood sugar\b|\bhypoglyc/, cards: ['diabetic'] },
  { re: /\bhead injur|\bhit (his|her|my|their) head\b|\bconcussion\b|\bfell and hit\b/, cards: ['head-injury'] },
  { re: /\bsnake ?bite|\bbitten by (a )?snake\b|\bdog bite|\banimal bite/, cards: ['bites'] },
  { re: /\bin labor\b|\bbaby is coming\b|\bgiving birth\b|\bwater (just )?broke\b|\bcrowning\b|\bdeliver(ing)? (a|the|my) baby\b/, cards: ['childbirth'] },
  { re: /\b(house|apartment|kitchen|building|room) (is )?on fire\b|\bfire in (the|my) (house|home|kitchen|apartment)\b|\bsmoke (in|filling) (the|my)\b|\bsmell smoke\b/, cards: ['house-fire'] },
  { re: /\bsmell (gas|natural gas|propane)\b|\bgas leak\b|\bsmells like (rotten eggs|gas)\b|\bhissing\b.*\bgas\b/, cards: ['gas-leak'] },
  { re: /\bcarbon monoxide (alarm|detector)\b.*\b(going off|beeping|sounding)\b|\bco alarm\b|\bcarbon monoxide poison/, cards: ['carbon-monoxide'] },
  { re: /\bheat ?stroke\b|\bheat exhaustion\b|\bsomeone (is )?(overheating|overheated)\b/, cards: ['heat'] },
  { re: /\bhypothermia\b|\bfrostbite\b|\bfrozen\b.*\b(fingers|toes|skin)\b/, cards: ['cold'] },
  { re: /\bburned\b|\bburnt\b|\bscald|\bchemical burn\b|\bburn (my|his|her)\b/, cards: ['burns'] },
  { re: /\bactive shooter\b|\bshooter\b|\bgunman\b|\bshots fired\b|\bsomeone with a gun\b/, cards: ['active-violence'] },
  { re: /\bnuclear (attack|bomb|explosion|blast|detonation)\b|\bmushroom cloud\b|\bradioactive fallout\b|\bdirty bomb\b/, cards: ['nuclear'] },
  { re: /\btornado (warning|is coming|coming|spotted|siren)\b|\btornado (is )?(near|nearby)\b/, cards: ['tornado'] },
  { re: /\btsunami (warning|alert|coming)\b/, cards: ['tsunami'] },
  { re: /\bearthquake (is )?(happening|now)\b|\bthe ground is shaking\b|\bit is an earthquake\b/, cards: ['earthquake'] },
  { re: /\bflood(ing)? (water )?(is )?(rising|coming in|in my)\b|\bwater is rising\b|\bflash flood warning\b/, cards: ['flood'] },
  { re: /\bchemical (spill|leak|release|cloud)\b|\btoxic (gas|cloud|fumes)\b|\bhazmat\b/, cards: ['hazmat'] },
  { re: /\bbuilding (collapsed|collapse)\b|\btrapped (under|in) (the )?(rubble|debris|building)\b/, cards: ['collapse'] },
];

const URGENT = /\b(help|urgent|emergency|right now|just|someone|somebody|he|she|they|him|her|my (dad|mom|mum|mother|father|husband|wife|friend|child|kid|son|daughter|baby|dog|cat|grandma|grandpa|grandmother|grandfather|brother|sister|partner|boyfriend|girlfriend|coworker|neighbor)|the baby|i think|is having|are having|isnt|wont|cant|is (not|bleeding|choking|unconscious|burning|drowning)|am having|im having|having a)\b/;
const INFORMATIONAL = /^(what is|what are|whats|define|explain|tell me about|what does)\b|\b(symptoms|signs|causes?|difference|types?) of\b|\b(phone )?number\b|\bhotline\b|\bhow (do|can|should) i (prepare|get ready|plan|train|learn)\b|\bhow to (prepare|get ready|plan)\b/;

/** Returns { cards: [ids] } when the question sounds like a present emergency, else null. Information questions ("what is X", "symptoms of X") are answered from the guides instead. */
export function emergencyIntent(question) {
  const q = norm(question);
  if (!q) return null;
  const words = q.split(' ').length;
  if (INFORMATIONAL.test(q) && !URGENT.test(q) && words > 2) return null;
  const hit = [];
  for (const r of EMERGENCY_RULES) if (r.re.test(q)) for (const c of r.cards) if (!hit.includes(c)) hit.push(c);
  return hit.length ? { cards: hit.slice(0, 3) } : null;
}

// ---- 2. Medicine guard -----------------------------------------------------------------------------------------
const DRUG = /\b(ibuprofen|advil|motrin|tylenol|acetaminophen|paracetamol|aspirin|benadryl|diphenhydramine|antihistamine|insulin|epinephrine|epipen|antibiotics?|amoxicillin|painkillers?|pain relievers?|medications?|medicines?|pills?|tablets?|capsules?|drugs?|opioids?|narcan|naloxone|prescriptions?|supplements?|vitamins?|sleeping pills?|cough syrup)\b/;
const DOSE_WORDS = /\b(dose|doses|dosage|dosing|mg|milligrams?|mcg|how much|how many|how often|how many times|can i (give|take)|can my (child|baby|kid|dog|cat) (have|take)|should i (give|take)|is it safe to (give|take)|safe amount|maximum|max)\b/;
const NOT_MEDICINE = /\b(bleach|water|gallon|fuel|gas|food|calories|battery|generator|bag|kit)\b/;

/** True when the question asks for medicine amounts or personal medicine advice, which the app never gives. */
export function medicineGuard(question) {
  const q = norm(question);
  if (!q) return false;
  if (/\b(dose|dosage|dosing|milligrams?|mcg)\b/.test(q) && !/\bbleach\b/.test(q)) return true;
  return DOSE_WORDS.test(q) && DRUG.test(q) && !NOT_MEDICINE.test(q);
}

// ---- 3. Calculator questions ---------------------------------------------------------------------------------------
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const numWord = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an)';
const toNum = (s) => (/^\d/.test(s) ? Number(s) : NUM_WORDS[s]);

function countBefore(q, nouns) {
  const m = q.match(new RegExp(`\\b${numWord}\\s+(?:${nouns})\\b`));
  return m ? toNum(m[1]) : null;
}
function days(q) {
  let m = q.match(new RegExp(`\\b${numWord}\\s*[- ]?\\s*(day|days|week|weeks|month|months)\\b`));
  if (m) { const n = toNum(m[1]); const u = m[2]; return u.startsWith('week') ? n * 7 : u.startsWith('month') ? n * 30 : n; }
  if (/\b(a|one) week\b/.test(q)) return 7;
  if (/\bweekend\b/.test(q)) return 3;
  return null;
}
function people(q) {
  const fam = q.match(new RegExp(`\\bfamily of ${numWord}\\b`));
  const adults = countBefore(q, 'people|persons|adults|of us|folks|family members|men|women|grown-?ups') ?? (fam ? toNum(fam[1]) : null);
  const kids = countBefore(q, 'kids|children|child|toddlers|babies|boys|girls|teens');
  return { adults, kids };
}

/**
 * Detects a calculable question. Returns { id, inputs, assumed: [strings] } or null.
 * Only fires when the question contains numbers to compute with; otherwise the guides answer it.
 */
export function calcIntent(question) {
  const q = norm(question);
  if (!q) return null;

  // Battery runtime: "how long will a 500 Wh battery run a 50 W fridge"
  const cap = q.match(/(\d+(?:\.\d+)?)\s*(kwh|wh|watt[- ]?hours?|mah|ah|amp[- ]?hours?)\b/);
  const load = q.match(/(\d+(?:\.\d+)?)\s*(?:w|watts?)\b(?!\s*-?\s*hours?)/);
  if (cap && load && /\b(run|last|power|keep|how long|runtime)\b/.test(q)) {
    const unit = cap[2];
    let capacity = Number(cap[1]), capacityUnit = 'Wh', voltage = 12, assumed = [];
    if (/^kwh/.test(unit)) capacity *= 1000;
    else if (/^mah/.test(unit)) { capacityUnit = 'mAh'; voltage = 3.7; assumed.push('3.7 V battery (typical phone power bank)'); }
    else if (/^(ah|amp)/.test(unit)) { capacityUnit = 'Ah'; assumed.push('12 V battery'); }
    return { id: 'battery', inputs: { capacity, capacityUnit, voltage, loadW: Number(load[1]), targetHours: '' }, assumed };
  }

  const p = people(q), d = days(q);
  const hasNumbers = p.adults != null || p.kids != null || d != null;

  if (/\bwater\b/.test(q) && /\b(how much|how many|gallons?|liters?|litres?|store|enough|need)\b/.test(q) && hasNumbers && !/\bbleach\b/.test(q)) {
    const assumed = [];
    let adults = p.adults, days_ = d;
    if (adults == null && p.kids == null) { adults = 1; assumed.push('1 adult'); }
    if (days_ == null) { days_ = 3; assumed.push('3 days'); }
    const pets = countBefore(q, 'pets|dogs|cats|dog|cat');
    return { id: 'water', inputs: { adults: adults ?? 0, children: p.kids ?? 0, pets: pets ?? 0, days: days_ }, assumed };
  }

  if (/\b(calories|food|meals?)\b/.test(q) && /\b(how much|how many|store|need|enough)\b/.test(q) && hasNumbers && !/\bwater\b/.test(q)) {
    const assumed = [];
    let adults = p.adults, days_ = d;
    if (adults == null && p.kids == null) { adults = 1; assumed.push('1 adult'); }
    if (days_ == null) { days_ = 3; assumed.push('3 days'); }
    return { id: 'food', inputs: { adults: adults ?? 0, children: p.kids ?? 0, days: days_ }, assumed };
  }
  return null;
}

// ---- 4. Greetings and help -------------------------------------------------------------------------------------------
export function metaIntent(question) {
  const q = norm(question);
  if (/^(hi|hello|hey|hiya|good (morning|afternoon|evening)|yo)( there| cairn)?[ !.?]*$/.test(q)) return 'greeting';
  if (/^(help|what can you do|what can i ask|who are you|what are you|what is this|how does this work|how do you work)[ !.?]*$/.test(q)) return 'help';
  return null;
}

// ---- 5. Things an offline app cannot know -----------------------------------------------------------------------------
// Live information (forecasts, news, prices, scores, today's date) and general-knowledge questions that are not about preparedness.
// Without this, a word like "weather" would match the NOAA radio guide and look like an answer to "what is the weather tomorrow".
export function liveIntent(question) {
  const q = norm(question);
  if (/\b(weather|forecast|temperature|rain|snow)\b.*\b(today|tomorrow|tonight|this (week|weekend)|right now|now|next week)\b/.test(q)) return true;
  if (/\b(today|tomorrow|tonight|right now|currently)\b.*\b(weather|forecast)\b/.test(q)) return true;
  if (/\b(latest|breaking|current|today'?s)\b.*\b(news|headlines|score|scores|price|prices)\b/.test(q)) return true;
  if (/\b(stock|share|bitcoin|crypto)\b.*\b(price|prices|worth)\b/.test(q)) return true;
  if (/^(who is|who's|who was) (the )?(current )?(president|prime minister|governor|mayor|king|queen|ceo)\b/.test(q)) return true;
  if (/\bwhat (time|day|date) is it\b/.test(q)) return true;
  return false;
}
