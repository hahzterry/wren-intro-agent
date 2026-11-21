
/**
 * WAREHOUSEJOBZ AI
 * Deterministic text parsing and recruiting guardrails.
 *
 * Supports worker and employer onboarding,
 * warehouse skills, hourly pay, shift preferences,
 * introduction consent and interview scheduling.
 *
 * Existing exports remain available for compatibility.
 */

export type Intent = "yes" | "no" | "more" | "other";

// --------------------------------------------------
// INTENT CLASSIFICATION
// --------------------------------------------------

const YES =
  /\b(yes|yeah|yep|yup|sure|ok(?:ay)?|sounds (?:good|great)|let'?s (?:do it|go|talk)|intro me|connect me|i'?m in|interested|absolutely|for sure|works(?: for me)?|please do|go ahead|looks (?:right|good|great)|perfect|send it)\b/i;

const NO =
  /\b(no|nope|nah|not (?:for me|interested|right now|at the moment|a fit|really)|pass|skip|decline|don'?t think so|i'?ll pass)\b/i;

const MORE =
  /(\?|\b(more|details|tell me|who is|what'?s|why|how much|hourly|pay|wage|shift|schedule|location|address|where|when|requirements|benefits|overtime)\b)/i;

export function intent(text: string): Intent {
  const t = text.trim();

  if (!t) return "other";

  if (
    NO.test(t) &&
    !/\b(no problem|no worries|no issue)\b/i.test(t)
  ) {
    return "no";
  }

  // A question isn't necessarily consent.
  if (MORE.test(t) && /\?/.test(t)) {
    return "more";
  }

  if (YES.test(t)) return "yes";
  if (MORE.test(t)) return "more";

  return "other";
}

// --------------------------------------------------
// HOURLY PAY
// --------------------------------------------------

export function extractHourlyPay(
  text: string
): number | undefined {
  const match = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/\s*(?:hr|hour)|per\s+hour|hourly)/i
  );

  if (match) {
    const value = Number(match[1]);

    return value > 0 && value <= 150
      ? value
      : undefined;
  }

  const minimum = text.match(
    /\b(?:minimum|at least|lowest|need|want|expect|looking for)\s*(?:is|of|around|about)?\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hourly|an hour)?/i
  );

  if (minimum) {
    const value = Number(minimum[1]);

    return value >= 7 && value <= 150
      ? value
      : undefined;
  }

  return undefined;
}

/**
 * Legacy compatibility:
 * Original Wren stored annual salaries in thousands.
 *
 * WarehouseJobz must not interpret $20/hr as $20K.
 *
 * Returns undefined deliberately until agent.ts
 * migrates from floorK to desiredHourlyPay.
 */
export function extractFloorK(
  _text: string
): number | undefined {
  return undefined;
}

// --------------------------------------------------
// WORK LOCATION / SHIFT EXTRACTION
// --------------------------------------------------

export function extractSetups(text: string): string[] {
  const out = new Set<string>();

  if (
    /\b(on[- ]?site|in person|at the warehouse|warehouse location)\b/i.test(
      text
    )
  ) {
    out.add("onsite");
  }

  // Warehouse work is generally performed on-site.
  // Avoid inventing remote or hybrid options.

  return [...out];
}

/**
 * Legacy compatibility:
 * Startup funding stages are not relevant
 * to warehouse job matching.
 */
export function extractStages(
  _text: string
): string[] {
  return [];
}

export type WarehouseShift =
  | "first"
  | "second"
  | "third"
  | "weekend"
  | "flexible";

export function extractWarehouseShifts(
  text: string
): WarehouseShift[] {
  const shifts = new Set<WarehouseShift>();

  if (/\b(first|1st|morning|day)\s*shift\b/i.test(text))
    shifts.add("first");

  if (/\b(second|2nd|evening|afternoon)\s*shift\b/i.test(text))
    shifts.add("second");

  if (/\b(third|3rd|night|overnight)\s*shift\b/i.test(text))
    shifts.add("third");

  if (/\bweekends?\b/i.test(text))
    shifts.add("weekend");

  if (
    /\b(any shift|flexible|open availability)\b/i.test(text)
  ) {
    shifts.add("flexible");
  }

  return [...shifts];
}

// --------------------------------------------------
// AGENT MENTION DETECTION
// --------------------------------------------------

export const mentionsAgent = (
  text: string,
  name = "warehousejobz"
): boolean => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `(^|[^a-z])@?(?:${escaped}|warehousejobz ai|wren|bot|assistant)\\b`,
    "i"
  ).test(text);
};

// --------------------------------------------------
// INTERVIEW TIME EXTRACTION
// --------------------------------------------------

const DAY =
  /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\b/i;

const TIME =
  /\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/i;

const AGREE =
  /\b(works|confirmed|booked|see you|locked(?: in)?|sent (?:you )?(?:an )?invite|let'?s do|that time works)\b/i;

/**
 * Detects an explicitly accepted interview time.
 *
 * This is only a proposed scheduling signal.
 * The calling code must verify agreement from
 * both participants before confirming a booking.
 */
export function agreedSlot(
  text: string,
  offered: string[] = []
): string | undefined {
  if (
    !AGREE.test(text) ||
    /\?\s*$/.test(text.trim())
  ) {
    return undefined;
  }

  const day = text.match(DAY)?.[0];
  const time = text.match(TIME)?.[0];

  if (!day || !time) return undefined;

  const normalizeDay = (s: string) =>
    s.slice(0, 3).toLowerCase();

  const normalizeTime = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "");

  const hit = offered.find((slot) => {
    const slotDay = slot.match(DAY)?.[0];
    const slotTime = slot.match(TIME)?.[0];

    return (
      slotDay &&
      slotTime &&
      normalizeDay(slotDay) === normalizeDay(day) &&
      normalizeTime(slotTime) === normalizeTime(time)
    );
  });

  // Only return a time already offered by the employer.
  // Don't manufacture an interview appointment.
  return hit;
}

// --------------------------------------------------
// WAREHOUSE SKILL EXTRACTION
// --------------------------------------------------

const SKILL_WORDS: [string, RegExp][] = [
  [
    "forklift",
    /\b(forklift|forklift operator|forklift driver)\b/i,
  ],
  [
    "reach truck",
    /\b(reach truck|reach forklift)\b/i,
  ],
  [
    "cherry picker",
    /\b(cherry picker|order picker machine)\b/i,
  ],
  [
    "pallet jack",
    /\bpallet jack\b/i,
  ],
  [
    "electric pallet jack",
    /\belectric pallet jack\b/i,
  ],
  [
    "rf scanner",
    /\b(rf scanner|rf gun|barcode scanner)\b/i,
  ],
  [
    "order picking",
    /\b(order picking|picking orders|picker)\b/i,
  ],
  [
    "packing",
    /\b(packing|packer|packaging)\b/i,
  ],
  [
    "loading",
    /\b(loading|loader|load trucks)\b/i,
  ],
  [
    "unloading",
    /\b(unloading|unloader|unload trucks)\b/i,
  ],
  [
    "shipping",
    /\bshipping\b/i,
  ],
  [
    "receiving",
    /\breceiving\b/i,
  ],
  [
    "inventory",
    /\binventory\b/i,
  ],
  [
    "cycle counting",
    /\bcycle count(?:ing)?\b/i,
  ],
  [
    "quality control",
    /\b(quality control|quality inspection|qc)\b/i,
  ],
  [
    "wms",
    /\b(wms|warehouse management system)\b/i,
  ],
  [
    "warehouse safety",
    /\b(warehouse safety|osha|safety procedures)\b/i,
  ],
  [
    "material handling",
    /\b(material handling|material handler)\b/i,
  ],
  [
    "logistics",
    /\b(logistics|distribution center|freight)\b/i,
  ],
];

export function extractSkills(
  text: string
): string[] {
  return [
    ...new Set(
      SKILL_WORDS
        .filter(([, regex]) => regex.test(text))
        .map(([skill]) => skill)
    ),
  ];
}

// --------------------------------------------------
// NAME EXTRACTION
// --------------------------------------------------

const NOT_NAMES =
  /^(yo|hi|hey|hello|hiya|sup|ok|okay|yes|yeah|no|nope|lol|haha|hmm|thanks|ty|open|hiring|looking|sure|cool|nice|good|great|what|who|why|how|the|a|an|i|im|its|just|so|well|um|uh|test|ping|warehouse|forklift|picker|packer|worker|job|shift|staffing)$/i;

const NOT_NAME_WORDS =
  /\b(open|hiring|looking|job|role|new|something|interested|recruit\w*|help|intros?|friend|said|warehouse|forklift|picker|packer|shift|staffing)\b/i;

const capitalize = (word: string): string =>
  word.charAt(0).toUpperCase() +
  word.slice(1).toLowerCase();

/**
 * "My name is Alex"
 * "I'm Jordan Smith"
 * "Call me Mike"
 */
export function statedName(
  text: string
): {
  first: string;
  name: string;
} | undefined {
  const t = text.trim().replace(/[.!?]+$/, "");

  const lead =
    String.raw`(?:my name is|my name's|call me|this is|i am|i'?m|it'?s)\s+`;

  const m =
    t.match(
      new RegExp(
        lead +
          String.raw`([a-z][\w'-]*)\s+([a-z][\w'-]*)$`,
        "i"
      )
    ) ??
    t.match(
      new RegExp(
        lead +
          String.raw`([a-z][\w'-]*)(?=\s*(?:[,;:—-]|$)|\s+(?:and|here|from|at|but|hiring|looking)\b)`,
        "i"
      )
    );

  if (!m) return undefined;

  const words = [m[1], m[2]].filter(
    (word): word is string => Boolean(word)
  );

  if (
    NOT_NAMES.test(words[0]) ||
    words.some((word) => NOT_NAME_WORDS.test(word))
  ) {
    return undefined;
  }

  const parts = words
    .filter((word) => !NOT_NAMES.test(word))
    .map(capitalize);

  if (!parts.length) return undefined;

  return {
    first: parts[0],
    name: parts.join(" "),
  };
}

export function extractName(
  text: string
): {
  first: string;
  name: string;
} | undefined {
  const stated = statedName(text);

  if (stated) return stated;

  const t = text
    .trim()
    .replace(/[.!?,]+$/, "");

  if (
    /\b(i'?m|my|it'?s|this is)\b/i.test(t) ||
    NOT_NAME_WORDS.test(t) ||
    t.split(/\s+/).length > 3
  ) {
    return undefined;
  }

  const words = t.split(/\s+/).slice(0, 2);

  if (
    !words.length ||
    words[0].length > 20 ||
    !/^[a-z]/i.test(words[0]) ||
    NOT_NAMES.test(words[0])
  ) {
    return undefined;
  }

  const parts = words.map(capitalize);

  return {
    first: parts[0],
    name: parts.join(" "),
  };
}

// --------------------------------------------------
// REFERRAL EXTRACTION
// --------------------------------------------------

export function extractVoucher(
  text: string
): string | "nobody" | undefined {
  const t = text
    .trim()
    .replace(/[.!?]+$/, "");

  if (
    /^(nobody|no one|noone|none|myself|i found you|found you online|google|youtube|tiktok|facebook|instagram|linkedin)\b/i.test(
      t
    )
  ) {
    return "nobody";
  }

  const m = t.match(
    /^(?:(?:my\s+)?(?:friend|coworker|colleague|manager|boss|supervisor|recruiter)\s+)?(?:it was\s+|from\s+)?([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2})(?:\s+(?:sent|told|referred|mentioned|said)\b.*)?$/
  );

  const name =
    m?.[1] ??
    (/^[a-z][\w'-]+(\s+[a-z][\w'-]+)?$/i.test(t)
      ? t
      : undefined);

  if (
    !name ||
    NOT_NAMES.test(name) ||
    NOT_NAME_WORDS.test(name) ||
    /\b(i'?m|my|you|me)\b/i.test(name)
  ) {
    return undefined;
  }

  return name
    .split(/\s+/)
    .map(capitalize)
    .join(" ");
}

// --------------------------------------------------
// EMPLOYER / WORKER INTENT
// --------------------------------------------------

export function readSide(
  text: string
): "hiring" | "looking" | undefined {
  if (
    /\b(hiring|recruit\w*|we need|need workers|need staff|need employees|staffing|open positions?|job openings?|headcount|job description|on behalf of|our warehouse|our distribution center|hiring manager)\b/i.test(
      text
    )
  ) {
    return "hiring";
  }

  if (
    /\b(looking for work|looking for a job|need a job|warehouse jobs?|job hunting|seeking employment|open to work|available to work|new job|next job|forklift jobs?|picker jobs?|packer jobs?|looking for warehouse work|candidate)\b/i.test(
      text
    )
  ) {
    return "looking";
  }

  return undefined;
}

// --------------------------------------------------
// SMS COMPLIANCE / SMALL TALK
// --------------------------------------------------

export const isOptOut = (
  text: string
): boolean =>
  /^(stop|unsubscribe|opt[\s-]?out|cancel|end|quit)$/i.test(
    text.trim().replace(/[.!]+$/, "")
  );

export const isSmallTalkAck = (
  text: string
): boolean =>
  /^(thanks|thank you|ty|tysm|lol|haha+|love it|amazing|yay|🙏|❤️|👍)[!. ]*$/i.test(
    text.trim()
  );
