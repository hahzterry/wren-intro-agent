
import type { Intro, Person } from "../types.js";

/**
 * WAREHOUSEJOBZ AI
 * Warehouse Worker <-> Employer Matching Engine
 *
 * Compatible with the existing Agent API:
 * - rankCandidates()
 * - rankFounders()
 * - renderReasons()
 * - family()
 *
 * Legacy "founder" records represent employers until
 * the Person/Store schema is migrated.
 */

export interface MatchResult {
  founder: Person;
  score: number;
  reasons: string[];
}

export interface CandidateMatchResult {
  candidate: Person;
  score: number;
  reasons: string[];
}

type WarehouseShift =
  | "first"
  | "second"
  | "third"
  | "weekend"
  | "flexible";

type WarehouseFamily =
  | "forklift"
  | "picking"
  | "packing"
  | "loading"
  | "inventory"
  | "shipping"
  | "general"
  | "supervisor";

type WarehouseCandidate = NonNullable<Person["candidate"]> & {
  desiredHourlyPay?: number;
  preferredShifts?: WarehouseShift[];
  city?: string;
  state?: string;
  zipCode?: string;
  maxCommuteMiles?: number;
  availableFrom?: string;
  equipmentExperience?: string[];
  forkliftTraining?: {
    reported: boolean;
    verified: boolean;
  };
  screeningStatus?: string;
};

type WarehouseEmployer = NonNullable<Person["founder"]> & {
  hourlyPayMin?: number;
  hourlyPayMax?: number;
  city?: string;
  state?: string;
  shiftStart?: string;
  shiftEnd?: string;
  shift?: WarehouseShift;
  startDate?: string;
  workersNeeded?: number;
  status?: string;
  requiredEquipment?: string[];
  requiresVerifiedForkliftTraining?: boolean;
  employmentType?: string;
};

export const MIN_SCORE = 4;

// Unlike startup recruiting, warehouse openings may
// legitimately require only one specific skill.
export const MIN_OVERLAP = 1;

export const joinList = (xs: string[]): string =>
  xs.length < 2
    ? xs.join("")
    : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

export function renderReasons(
  reasons: string[],
  who: string,
  max = reasons.length
): string {
  const you = who === "you";

  const parts = reasons.slice(0, max).map((r) =>
    r
      .replace(/\{Cs\}/g, you ? "your" : `${who}'s`)
      .replace(/\{C\}/g, who)
      .replace(/\{has\}/g, you ? "have" : "has")
      .replace(/\{wants\}/g, you ? "want" : "wants")
  );

  const s =
    parts.length > 1
      ? `${parts.slice(0, -1).join("; ")}; and ${parts.at(-1)}`
      : parts[0] ?? "";

  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --------------------------------------------------
// WAREHOUSE JOB CLASSIFICATION
// --------------------------------------------------

const FAMILIES: [WarehouseFamily, RegExp][] = [
  [
    "forklift",
    /\b(forklift|reach truck|cherry picker|clamp truck|order picker operator)\b/i,
  ],
  [
    "picking",
    /\b(order pick(?:er|ing)?|picker|pick and pack|fulfillment associate)\b/i,
  ],
  [
    "packing",
    /\b(pack(?:er|ing)|packaging|sortation|sorter)\b/i,
  ],
  [
    "loading",
    /\b(load(?:er|ing)?|unload(?:er|ing)?|dock worker|freight handler)\b/i,
  ],
  [
    "inventory",
    /\b(inventory|cycle count|stock control|inventory control)\b/i,
  ],
  [
    "shipping",
    /\b(shipping|receiving|distribution associate)\b/i,
  ],
  [
    "supervisor",
    /\b(supervisor|team lead|shift lead|warehouse manager)\b/i,
  ],
  [
    "general",
    /\b(warehouse associate|general labor|material handler|warehouse worker)\b/i,
  ],
];

export function family(
  title = ""
): WarehouseFamily | undefined {
  return FAMILIES.find(([, re]) => re.test(title))?.[0];
}

// --------------------------------------------------
// NORMALIZATION
// --------------------------------------------------

function normalizeSkill(value: string): string {
  const skill = value
    .toLowerCase()
    .trim()
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ");

  const aliases: Record<string, string> = {
    "forklift driver": "forklift",
    "forklift operator": "forklift",
    "sit down forklift": "forklift",
    "stand up forklift": "forklift",
    "reach forklift": "reach truck",
    "reach lift": "reach truck",
    "rf scanning": "rf scanner",
    "rf gun": "rf scanner",
    "picking": "order picking",
    "picker": "order picking",
    "packing": "packing",
    "pallet jacks": "pallet jack",
    "electric pallet jacks": "electric pallet jack",
    "loading trucks": "loading",
    "unloading trucks": "unloading",
  };

  return aliases[skill] ?? skill;
}

function normalizeShift(
  value?: string
): WarehouseShift | undefined {
  if (!value) return undefined;

  const s = value.toLowerCase();

  if (/flexible|any shift|open availability/.test(s))
    return "flexible";

  if (/weekend|sat|sun/.test(s))
    return "weekend";

  if (/third|3rd|overnight|night shift|graveyard/.test(s))
    return "third";

  if (/second|2nd|evening|afternoon shift/.test(s))
    return "second";

  if (/first|1st|morning|day shift/.test(s))
    return "first";

  return undefined;
}

function extractHourlyPay(
  text: string
): [number, number] | undefined {
  const range = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i
  );

  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);

    if (min > 0 && max >= min && max <= 150) {
      return [min, max];
    }
  }

  const single = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/\s*(?:hr|hour)|per hour|hourly)/i
  );

  if (single) {
    const rate = Number(single[1]);

    if (rate > 0 && rate <= 150) {
      return [rate, rate];
    }
  }

  return undefined;
}

function getEmployerPay(
  fp: WarehouseEmployer
): [number, number] | undefined {
  if (
    fp.hourlyPayMin !== undefined &&
    fp.hourlyPayMax !== undefined
  ) {
    return [fp.hourlyPayMin, fp.hourlyPayMax];
  }

  // Do not interpret legacy bandK as hourly pay.
  return extractHourlyPay(fp.jd ?? "");
}

function getCandidatePay(
  cp: WarehouseCandidate
): number | undefined {
  // Legacy floorK is annual salary in thousands.
  // It must never be compared directly to hourly pay.
  return cp.desiredHourlyPay;
}

function sameLocation(
  cp: WarehouseCandidate,
  fp: WarehouseEmployer
): boolean | undefined {
  if (!cp.city || !fp.city) return undefined;

  if (
    cp.state &&
    fp.state &&
    cp.state.toLowerCase() !== fp.state.toLowerCase()
  ) {
    return false;
  }

  return (
    cp.city.trim().toLowerCase() ===
    fp.city.trim().toLowerCase()
  );
}

function validDate(value?: string): number | undefined {
  if (!value) return undefined;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? timestamp
    : undefined;
}

// --------------------------------------------------
// MATCH SCORING
// --------------------------------------------------

function scoreWarehouseMatch(
  c: Person,
  f: Person
): { score: number; reasons: string[] } | null {
  const cp = c.candidate as WarehouseCandidate | undefined;
  const fp = f.founder as WarehouseEmployer | undefined;

  if (!cp || !fp) return null;
  if (c.optedOut || f.optedOut) return null;

  if (fp.status === "closed" || fp.status === "filled")
    return null;

  if (
    fp.workersNeeded !== undefined &&
    fp.workersNeeded <= 0
  ) {
    return null;
  }

  const reasons: string[] = [];
  let score = 0;

  // ----------------------------------------------
  // 1. ROLE COMPATIBILITY
  // ----------------------------------------------

  const workerFamily = family(cp.title);
  const jobFamily = family(fp.roleTitle);

  if (
    workerFamily &&
    jobFamily &&
    workerFamily !== jobFamily &&
    workerFamily !== "general" &&
    jobFamily !== "general"
  ) {
    return null;
  }

  if (workerFamily && workerFamily === jobFamily) {
    score += 3;
    reasons.push(
      `{C} {has} experience in ${fp.roleTitle}`
    );
  } else if (
    workerFamily === "general" ||
    jobFamily === "general"
  ) {
    score += 1;
    reasons.push(
      `{Cs} warehouse background may fit this position`
    );
  }

  // ----------------------------------------------
  // 2. REQUIRED SKILLS
  // ----------------------------------------------

  const workerSkills = new Set(
    [
      ...cp.skills,
      ...(cp.equipmentExperience ?? []),
    ].map(normalizeSkill)
  );

  const requiredSkills = [
    ...new Set(
      [
        ...fp.mustHaves,
        ...(fp.requiredEquipment ?? []),
      ].map(normalizeSkill)
    ),
  ];

  const overlap = requiredSkills.filter((skill) =>
    workerSkills.has(skill)
  );

  // All explicitly required skills must be met.
  // Missing requirements must be reviewed rather
  // than silently treating them as satisfied.
  if (
    requiredSkills.length > 0 &&
    overlap.length !== requiredSkills.length
  ) {
    return null;
  }

  if (overlap.length >= MIN_OVERLAP) {
    score += overlap.length * 2;

    reasons.push(
      `{C} {has} experience with ${joinList(overlap)}`
    );
  }

  // ----------------------------------------------
  // 3. FORKLIFT TRAINING VERIFICATION
  // ----------------------------------------------

  if (fp.requiresVerifiedForkliftTraining) {
    if (!cp.forkliftTraining?.verified) {
      return null;
    }

    score += 2;
    reasons.push(
      `{Cs} forklift training has been verified`
    );
  }

  // ----------------------------------------------
  // 4. HOURLY PAY
  // ----------------------------------------------

  const pay = getEmployerPay(fp);
  const desiredPay = getCandidatePay(cp);

  if (desiredPay !== undefined && pay) {
    if (pay[1] < desiredPay) {
      return null;
    }

    if (pay[0] >= desiredPay) {
      score += 3;

      reasons.push(
        `the hourly rate meets {Cs} $${desiredPay}/hr minimum`
      );
    } else {
      score += 1;

      reasons.push(
        `the hourly pay range reaches {Cs} requested rate`
      );
    }
  }

  // ----------------------------------------------
  // 5. SHIFT AVAILABILITY
  // ----------------------------------------------

  const jobShift =
    fp.shift ??
    normalizeShift(fp.setup);

  const preferredShifts =
    cp.preferredShifts ?? [];

  if (jobShift && preferredShifts.length > 0) {
    if (
      !preferredShifts.includes(jobShift) &&
      !preferredShifts.includes("flexible")
    ) {
      return null;
    }

    score += 3;

    reasons.push(
      `the ${jobShift} shift matches {Cs} availability`
    );
  }

  // ----------------------------------------------
  // 6. LOCATION
  // ----------------------------------------------

  const location = sameLocation(cp, fp);

  if (location === true) {
    score += 2;

    reasons.push(
      `the warehouse is in {Cs} preferred city`
    );
  }

  // A different city is not automatically
  // disqualifying: the worker may commute.
  // Actual distance requires geocoding/routing.

  // ----------------------------------------------
  // 7. START DATE
  // ----------------------------------------------

  const available = validDate(cp.availableFrom);
  const start = validDate(fp.startDate);

  if (
    available !== undefined &&
    start !== undefined
  ) {
    if (available > start) {
      return null;
    }

    score += 2;

    reasons.push(
      `{C} {has} availability for the start date`
    );
  }

  // ----------------------------------------------
  // 8. SCREENING STATUS
  // ----------------------------------------------

  if (cp.screeningStatus === "ready") {
    score += 1;

    reasons.push(
      `{Cs} initial screening is complete`
    );
  }

  if (score < MIN_SCORE) return null;

  return { score, reasons };
}

// --------------------------------------------------
// EMPLOYER-INITIATED MATCHING
// --------------------------------------------------

export function rankCandidates(
  f: Person,
  people: Person[],
  intros: Intro[]
): CandidateMatchResult[] {
  if (
    f.role !== "founder" ||
    f.stage !== "ready" ||
    f.optedOut
  ) {
    return [];
  }

  const already = new Set(
    intros
      .filter((i) => i.founderId === f.id)
      .map((i) => i.candidateId)
  );

  const out: CandidateMatchResult[] = [];

  for (const c of people) {
    if (
      c.role !== "candidate" ||
      c.stage !== "ready" ||
      c.optedOut ||
      already.has(c.id)
    ) {
      continue;
    }

    const result = scoreWarehouseMatch(c, f);

    if (!result) continue;

    out.push({
      candidate: c,
      score: result.score,
      reasons: result.reasons,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

// --------------------------------------------------
// WORKER-INITIATED MATCHING
// --------------------------------------------------

export function rankFounders(
  c: Person,
  people: Person[],
  intros: Intro[]
): MatchResult[] {
  if (
    c.role !== "candidate" ||
    c.stage !== "ready" ||
    c.optedOut
  ) {
    return [];
  }

  const already = new Set(
    intros
      .filter((i) => i.candidateId === c.id)
      .map((i) => i.founderId)
  );

  const out: MatchResult[] = [];

  for (const f of people) {
    if (
      f.role !== "founder" ||
      f.stage !== "ready" ||
      f.optedOut ||
      already.has(f.id)
    ) {
      continue;
    }

    const result = scoreWarehouseMatch(c, f);

    if (!result) continue;

    out.push({
      founder: f,
      score: result.score,
      reasons: result.reasons,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}
