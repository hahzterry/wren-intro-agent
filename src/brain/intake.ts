
/**
 * WAREHOUSEJOBZ AI
 * Warehouse Worker & Employer Intake Engine
 *
 * Supports:
 * - Forklift operators
 * - Reach truck operators
 * - Order pickers
 * - Packers
 * - Material handlers
 * - Loaders and unloaders
 * - Shipping and receiving
 * - Inventory associates
 * - Warehouse supervisors
 *
 * Designed to work with:
 * - agent.ts
 * - llm.ts
 * - match.ts
 *
 * Compatibility:
 * - Preserves existing exports.
 * - Preserves question keys used by Agent.
 * - Keeps legacy parseJD fields so existing callers compile.
 * - Adds warehouse-specific structured fields.
 */

export interface IntakeQuestion {
  key: string;
  ask: string;
  listenFor: string;
}

export type WarehouseShift =
  | "first"
  | "second"
  | "third"
  | "weekend"
  | "flexible";

export type WarehouseEmploymentType =
  | "full-time"
  | "part-time"
  | "temporary"
  | "direct-hire"
  | "contract";

export interface ParsedWarehouseResume {
  title?: string;
  years?: number;
  skills?: string[];
  equipment?: string[];
  preferredShifts?: WarehouseShift[];
  desiredHourlyPay?: number;
  city?: string;
  state?: string;
  availableFrom?: string;
}

export interface ParsedWarehouseJD {
  roleTitle?: string;

  // Legacy compatibility only.
  // Warehouse jobs use hourlyPayMin/Max instead.
  bandK?: [number, number];
  equity?: string;

  setup?: string;

  hourlyPayMin?: number;
  hourlyPayMax?: number;

  city?: string;
  state?: string;

  shift?: WarehouseShift;
  shiftStart?: string;
  shiftEnd?: string;

  workersNeeded?: number;
  startDate?: string;

  requiredSkills?: string[];
  requiredEquipment?: string[];

  employmentType?: WarehouseEmploymentType;
}

// --------------------------------------------------
// WORKER INTERVIEW QUESTIONS
// --------------------------------------------------

export const CANDIDATE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "proudest",
    ask:
      "What warehouse jobs have you worked before? " +
      "Tell me about the work you're proudest of. " +
      "Have you done picking, packing, forklift, " +
      "loading, shipping, receiving, or inventory?",
    listenFor:
      "Previous warehouse roles, years of experience, " +
      "specific tasks, equipment experience, and " +
      "examples of reliable job performance.",
  },
  {
    key: "energy",
    ask:
      "What type of warehouse work do you prefer? " +
      "Forklift, picking, packing, loading, or something else? " +
      "And which shifts work best for you: " +
      "first, second, third, overnight, or weekends?",
    listenFor:
      "Preferred warehouse role, equipment experience, " +
      "preferred shifts, schedule limitations, and " +
      "work preferences.",
  },
  {
    key: "whyLeave",
    ask:
      "Are you currently working, or looking for a new warehouse job? " +
      "What would make you leave your current job, " +
      "and when could you start a new one?",
    listenFor:
      "Employment status, reason for seeking a new job, " +
      "availability, desired working conditions, " +
      "and potential start date.",
  },
  {
    key: "practical",
    ask:
      "Last few details so I can match you with the right warehouse jobs: " +
      "What's the lowest hourly pay you'd accept, " +
      "what city or ZIP code do you want to work in, " +
      "and which shifts can you work?",
    listenFor:
      "Minimum hourly pay, preferred work location, " +
      "commuting preferences, and shift availability. " +
      "These are matching constraints, not permission " +
      "to negotiate the worker's pay.",
  },
];

// --------------------------------------------------
// WAREHOUSE EMPLOYER QUESTIONS
// --------------------------------------------------

export const ROLE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "success",
    ask:
      "What does a successful worker look like in this warehouse role? " +
      "For example, what tasks should they handle confidently " +
      "during their first few weeks?",
    listenFor:
      "Actual job duties, productivity expectations, " +
      "equipment responsibilities, training requirements, " +
      "and realistic performance expectations.",
  },
  {
    key: "antiPattern",
    ask:
      "What qualifications are absolutely required? " +
      "For example, forklift experience, reach truck experience, " +
      "RF scanner knowledge, or previous warehouse work? " +
      "Which skills can you train someone to do?",
    listenFor:
      "Mandatory versus trainable skills, required " +
      "equipment experience, employer verification needs, " +
      "and qualifications directly related to the job.",
  },
  {
    key: "pitch",
    ask:
      "Why should a warehouse worker choose this job? " +
      "Tell me about the benefits, overtime opportunities, " +
      "working conditions, and anything applicants " +
      "should know before accepting an introduction.",
    listenFor:
      "Honest job advantages, benefits, overtime policy, " +
      "physical job requirements, scheduling expectations, " +
      "and potential worker concerns.",
  },
  {
    key: "practical",
    ask:
      "Final details: what's the hourly pay range, " +
      "warehouse location, shift schedule, " +
      "number of workers needed, and expected start date?",
    listenFor:
      "Hourly wage range, worksite location, " +
      "shift start/end times, staffing quantity, " +
      "and target start date.",
  },
];

// --------------------------------------------------
// WAREHOUSE JOB TITLES
// --------------------------------------------------

const WAREHOUSE_ROLE_PATTERNS: Array<{
  title: string;
  pattern: RegExp;
}> = [
  {
    title: "Reach Truck Operator",
    pattern: /\b(reach truck|reach forklift)\b/i,
  },
  {
    title: "Cherry Picker Operator",
    pattern: /\b(cherry picker|order picker operator)\b/i,
  },
  {
    title: "Forklift Operator",
    pattern: /\b(forklift operator|forklift driver|forklift)\b/i,
  },
  {
    title: "Warehouse Supervisor",
    pattern: /\b(warehouse supervisor|warehouse manager|shift supervisor)\b/i,
  },
  {
    title: "Inventory Associate",
    pattern: /\b(inventory associate|inventory control|cycle count(?:er)?)\b/i,
  },
  {
    title: "Shipping Associate",
    pattern: /\b(shipping associate|shipping clerk)\b/i,
  },
  {
    title: "Receiving Associate",
    pattern: /\b(receiving associate|receiving clerk)\b/i,
  },
  {
    title: "Order Picker",
    pattern: /\b(order picker|order picking|picker)\b/i,
  },
  {
    title: "Packer",
    pattern: /\b(packer|packing associate|packaging associate)\b/i,
  },
  {
    title: "Loader",
    pattern: /\b(loader|loading associate|dock worker)\b/i,
  },
  {
    title: "Unloader",
    pattern: /\b(unloader|unloading associate)\b/i,
  },
  {
    title: "Material Handler",
    pattern: /\b(material handler|material handling)\b/i,
  },
  {
    title: "Warehouse Associate",
    pattern: /\b(warehouse associate|warehouse worker|general warehouse|general labor)\b/i,
  },
];

export function extractWarehouseRole(
  text: string
): string | undefined {
  for (const role of WAREHOUSE_ROLE_PATTERNS) {
    if (role.pattern.test(text)) {
      return role.title;
    }
  }

  return undefined;
}

// --------------------------------------------------
// WAREHOUSE SKILLS
// --------------------------------------------------

const WAREHOUSE_SKILL_PATTERNS: Array<{
  skill: string;
  pattern: RegExp;
}> = [
  {
    skill: "forklift",
    pattern: /\bforklift\b/i,
  },
  {
    skill: "reach truck",
    pattern: /\breach truck\b/i,
  },
  {
    skill: "cherry picker",
    pattern: /\bcherry picker\b/i,
  },
  {
    skill: "pallet jack",
    pattern: /\bpallet jack\b/i,
  },
  {
    skill: "electric pallet jack",
    pattern: /\belectric pallet jack\b/i,
  },
  {
    skill: "rf scanner",
    pattern: /\b(rf scanner|rf gun|barcode scanner)\b/i,
  },
  {
    skill: "order picking",
    pattern: /\b(order picking|pick orders|picking orders)\b/i,
  },
  {
    skill: "packing",
    pattern: /\b(packaging|packing|packer)\b/i,
  },
  {
    skill: "loading",
    pattern: /\b(loading|loader|load trucks)\b/i,
  },
  {
    skill: "unloading",
    pattern: /\b(unloading|unloader|unload trucks)\b/i,
  },
  {
    skill: "shipping",
    pattern: /\bshipping\b/i,
  },
  {
    skill: "receiving",
    pattern: /\breceiving\b/i,
  },
  {
    skill: "inventory",
    pattern: /\binventory\b/i,
  },
  {
    skill: "cycle counting",
    pattern: /\bcycle count(?:ing)?\b/i,
  },
  {
    skill: "quality control",
    pattern: /\b(quality control|quality inspection|qc)\b/i,
  },
  {
    skill: "wms",
    pattern: /\b(wms|warehouse management system)\b/i,
  },
];

export function extractWarehouseSkills(
  text: string
): string[] {
  return WAREHOUSE_SKILL_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ skill }) => skill);
}

// --------------------------------------------------
// HOURLY PAY
// --------------------------------------------------

export function extractHourlyPayRange(
  text: string
): [number, number] | undefined {
  const range = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/\s*(?:hr|hour)|per\s+hour|hourly)?/i
  );

  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);

    if (min > 0 && max >= min && max <= 150) {
      return [min, max];
    }
  }

  const single = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/\s*(?:hr|hour)|per\s+hour|hourly)/i
  );

  if (single) {
    const rate = Number(single[1]);

    if (rate > 0 && rate <= 150) {
      return [rate, rate];
    }
  }

  return undefined;
}

export function extractMinimumHourlyPay(
  text: string
): number | undefined {
  const range = extractHourlyPayRange(text);

  if (range) return range[0];

  const minimum = text.match(
    /\b(?:minimum|min|at least|lowest|need|want|expect)\s*(?:is|of|around|about)?\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hourly|an hour)?/i
  );

  if (!minimum) return undefined;

  const value = Number(minimum[1]);

  return value >= 7 && value <= 150
    ? value
    : undefined;
}

// --------------------------------------------------
// SHIFT EXTRACTION
// --------------------------------------------------

export function extractWarehouseShifts(
  text: string
): WarehouseShift[] {
  const lower = text.toLowerCase();
  const shifts: WarehouseShift[] = [];

  if (
    /\b(first|1st|day|morning)\s*shift\b/.test(lower)
  ) {
    shifts.push("first");
  }

  if (
    /\b(second|2nd|evening|afternoon)\s*shift\b/.test(lower)
  ) {
    shifts.push("second");
  }

  if (
    /\b(third|3rd|night|overnight)\s*shift\b/.test(lower)
  ) {
    shifts.push("third");
  }

  if (/\bweekends?\b/.test(lower)) {
    shifts.push("weekend");
  }

  if (
    /\b(any shift|flexible|open availability)\b/.test(lower)
  ) {
    shifts.push("flexible");
  }

  return [...new Set(shifts)];
}

function extractShiftTime(
  text: string
): {
  shiftStart?: string;
  shiftEnd?: string;
} {
  const match = text.match(
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i
  );

  if (!match) return {};

  return {
    shiftStart: match[1].trim(),
    shiftEnd: match[2].trim(),
  };
}

// --------------------------------------------------
// LOCATION EXTRACTION
// --------------------------------------------------

const STATE_ABBREVIATIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT",
  "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN",
  "TX", "UT", "VT", "VA", "WA", "WV", "WI",
  "WY", "DC",
]);

function extractLocation(
  text: string
): {
  city?: string;
  state?: string;
} {
  const match = text.match(
    /\b([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Za-z]{2})\b/
  );

  if (!match) return {};

  const state = match[2].toUpperCase();

  if (!STATE_ABBREVIATIONS.has(state)) {
    return {};
  }

  return {
    city: match[1].trim(),
    state,
  };
}

// --------------------------------------------------
// RESUME PARSING
// --------------------------------------------------

export function parseResume(
  text: string
): ParsedWarehouseResume {
  const yearsMatch = text.match(
    /\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/i
  );

  const titleLine = text
    .split(/\n|\. /)
    .map((line) => line.trim())
    .find(
      (line) =>
        WAREHOUSE_ROLE_PATTERNS.some(({ pattern }) =>
          pattern.test(line)
        ) && line.length < 120
    );

  const title =
    (titleLine
      ? extractWarehouseRole(titleLine)
      : undefined) ??
    extractWarehouseRole(text);

  const pay = extractMinimumHourlyPay(text);
  const location = extractLocation(text);

  return {
    title,
    years: yearsMatch
      ? Number(yearsMatch[1])
      : undefined,
    skills: extractWarehouseSkills(text),
    equipment: extractWarehouseSkills(text).filter(
      (skill) =>
        /forklift|reach truck|cherry picker|pallet jack/i.test(skill)
    ),
    preferredShifts: extractWarehouseShifts(text),
    desiredHourlyPay: pay,
    ...location,
  };
}

// --------------------------------------------------
// JOB DESCRIPTION PARSING
// --------------------------------------------------

export function parseJD(
  text: string
): ParsedWarehouseJD {
  const titleLine = text
    .split(/\n|\. /)
    .map((line) => line.trim())
    .find(
      (line) =>
        WAREHOUSE_ROLE_PATTERNS.some(({ pattern }) =>
          pattern.test(line)
        ) && line.length < 120
    );

  const roleTitle =
    (titleLine
      ? extractWarehouseRole(titleLine)
      : undefined) ??
    extractWarehouseRole(text);

  const hourly = extractHourlyPayRange(text);
  const shifts = extractWarehouseShifts(text);
  const times = extractShiftTime(text);
  const location = extractLocation(text);

  const workers = text.match(
    /\b(?:need|hiring|looking for|seeking)\s+(\d{1,3})\s+(?:workers?|associates?|operators?|pickers?|packers?|people|employees?)\b/i
  );

  const start = text.match(
    /\b(?:start(?:ing)?|begin(?:ning)?)\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i
  );

  const employmentType: WarehouseEmploymentType | undefined =
    /\bdirect[- ]hire\b/i.test(text)
      ? "direct-hire"
      : /\btemporary|temp\b/i.test(text)
        ? "temporary"
        : /\bpart[- ]time\b/i.test(text)
          ? "part-time"
          : /\bfull[- ]time\b/i.test(text)
            ? "full-time"
            : /\bcontract\b/i.test(text)
              ? "contract"
              : undefined;

  return {
    roleTitle,

    // Intentionally omitted: warehouse wages are
    // hourly, not annual salaries.
    bandK: undefined,
    equity: undefined,

    setup:
      [
        ...shifts.map((s) => `${s} shift`),
        times.shiftStart && times.shiftEnd
          ? `${times.shiftStart}-${times.shiftEnd}`
          : "",
      ]
        .filter(Boolean)
        .join(", ") || undefined,

    hourlyPayMin: hourly?.[0],
    hourlyPayMax: hourly?.[1],

    ...location,

    shift: shifts[0],
    ...times,

    workersNeeded: workers
      ? Number(workers[1])
      : undefined,

    startDate: start?.[1],

    requiredSkills: extractWarehouseSkills(text),

    requiredEquipment: extractWarehouseSkills(text).filter(
      (skill) =>
        /forklift|reach truck|cherry picker|pallet jack/i.test(skill)
    ),

    employmentType,
  };
}

// --------------------------------------------------
// INTENT DETECTION
// --------------------------------------------------

export const soundsLikeHiring = (
  text: string
): boolean =>
  /\b(hiring|recruit\w*|we need|need workers|need staff|need employees|looking for (a|an|someone|workers|staff)|open positions?|job openings?|headcount|staffing|fill shifts?|warehouse manager|hiring manager|our warehouse|our distribution center)\b/i.test(
    text
  );

export const soundsLikeSkip = (
  text: string
): boolean =>
  /^(skip|no|nah|nope|later|don't have one|dont have one|not now|no resume)[.! ]*$/i.test(
    text.trim()
  );
