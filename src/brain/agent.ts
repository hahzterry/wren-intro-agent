
/**
 * WAREHOUSEJOBZ AI
 * Warehouse job parsing and job card generation.
 *
 * Compatible with the original Wren founder profile
 * while supporting warehouse-specific job fields.
 *
 * Keep existing Agent class and other imports/exports
 * elsewhere in agent.ts unchanged.
 */

// -----------------------------------------------
// PROFILE TYPES
// -----------------------------------------------

export interface FounderProfile {
  company: string;
  roleTitle: string;
  jd?: string;
  setup?: string;
  mustHaves: string[];
  success?: string;
  pitch?: string;

  // Warehouse-specific fields
  hourlyPayMin?: number;
  hourlyPayMax?: number;
  city?: string;
  state?: string;
  shift?: string;
  shiftStart?: string;
  shiftEnd?: string;
  workersNeeded?: number;
  startDate?: string;
  requiredSkills?: string[];
  requiredEquipment?: string[];
  employmentType?: string;
  requiresVerifiedForkliftTraining?: boolean;
  status?: string;
}

// -----------------------------------------------
// WAREHOUSE JOB ROLES
// -----------------------------------------------

export const WAREHOUSE_ROLES = [
  "reach truck operator",
  "forklift operator",
  "cherry picker operator",
  "order picker",
  "warehouse supervisor",
  "warehouse manager",
  "inventory control specialist",
  "inventory associate",
  "quality control inspector",
  "quality control",
  "shipping associate",
  "receiving associate",
  "material handler",
  "warehouse associate",
  "forklift driver",
  "pallet jack operator",
  "loader",
  "unloader",
  "picker",
  "packer",
];

// -----------------------------------------------
// WAREHOUSE SKILLS
// -----------------------------------------------

export const WAREHOUSE_SKILLS = [
  "sit-down forklift",
  "stand-up forklift",
  "electric pallet jack",
  "reach truck",
  "cherry picker",
  "pallet jack",
  "rf scanner",
  "order picking",
  "cycle counting",
  "quality control",
  "inventory control",
  "heavy lifting",
  "forklift",
  "packing",
  "loading",
  "unloading",
  "shipping",
  "receiving",
  "inventory",
  "wms",
];

// -----------------------------------------------
// WAREHOUSE SHIFTS
// -----------------------------------------------

export const WAREHOUSE_SHIFTS = [
  "first shift",
  "second shift",
  "third shift",
  "overnight",
  "weekends",
  "part-time",
  "full-time",
];

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
  | "contract"
  | "direct-hire";

// -----------------------------------------------
// TEXT HELPERS
// -----------------------------------------------

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(
  text: string,
  phrase: string
): boolean {
  const escaped = escapeRegExp(phrase)
    .replace(/\\-/g, "[-\\s]?")
    .replace(/\s+/g, "\\s+");

  return new RegExp(
    `(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,
    "i"
  ).test(text);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function formatPay(value: number): string {
  return `$${value.toFixed(2).replace(/\.00$/, "")}`;
}

function validHourlyPay(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 150
  );
}

// -----------------------------------------------
// SKILL EXTRACTION
// -----------------------------------------------

export function extractWarehouseSkills(
  text: string
): string[] {
  const normalized = normalizeText(text);

  const found = WAREHOUSE_SKILLS.filter(
    (skill) => containsPhrase(normalized, skill)
  );

  return unique(found);
}

// -----------------------------------------------
// SHIFT EXTRACTION
// -----------------------------------------------

export function extractWarehouseShift(
  text: string
): string[] {
  const normalized = normalizeText(text);
  const found = new Set<string>();

  if (
    /\b(first|1st|day|morning)\s*shift\b/i.test(
      normalized
    )
  ) {
    found.add("first shift");
  }

  if (
    /\b(second|2nd|evening|afternoon)\s*shift\b/i.test(
      normalized
    )
  ) {
    found.add("second shift");
  }

  if (
    /\b(third|3rd|night|overnight)\s*shift\b/i.test(
      normalized
    ) ||
    /\bovernight\b/i.test(normalized)
  ) {
    found.add("third shift");
  }

  if (/\bweekends?\b/i.test(normalized)) {
    found.add("weekends");
  }

  if (
    /\bpart[\s-]?time\b/i.test(normalized)
  ) {
    found.add("part-time");
  }

  if (
    /\bfull[\s-]?time\b/i.test(normalized)
  ) {
    found.add("full-time");
  }

  if (
    /\b(flexible|any shift|open availability)\b/i.test(
      normalized
    )
  ) {
    found.add("flexible");
  }

  return [...found];
}

/**
 * Normalized shift values for matching.
 */
export function extractNormalizedShifts(
  text: string
): WarehouseShift[] {
  const shifts = extractWarehouseShift(text);

  const normalized = new Set<WarehouseShift>();

  for (const shift of shifts) {
    switch (shift) {
      case "first shift":
        normalized.add("first");
        break;

      case "second shift":
        normalized.add("second");
        break;

      case "third shift":
        normalized.add("third");
        break;

      case "weekends":
        normalized.add("weekend");
        break;

      case "flexible":
        normalized.add("flexible");
        break;
    }
  }

  return [...normalized];
}

// -----------------------------------------------
// HOURLY PAY EXTRACTION
// -----------------------------------------------

/**
 * Returns:
 * "$20/hr"          -> [20, 20]
 * "$18-$22/hr"      -> [18, 22]
 * "$19 to $23/hour" -> [19, 23]
 *
 * Annual salaries are intentionally excluded.
 */
export function extractHourlyPay(
  text: string
): [number, number] | undefined {
  const range = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|—|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)(?:\s*(?:\/\s*(?:hr|hour)|per\s+hour|hourly))?/i
  );

  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);

    if (
      validHourlyPay(low) &&
      validHourlyPay(high) &&
      high >= low
    ) {
      return [low, high];
    }
  }

  const single = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/\s*(?:hr|hour)|per\s+hour|hourly)\b/i
  );

  if (single) {
    const rate = Number(single[1]);

    if (validHourlyPay(rate)) {
      return [rate, rate];
    }
  }

  return undefined;
}

// -----------------------------------------------
// JOB ROLE EXTRACTION
// -----------------------------------------------

export function extractWarehouseRole(
  text: string
): string {
  const normalized = normalizeText(text);

  const role = WAREHOUSE_ROLES.find(
    (item) => containsPhrase(normalized, item)
  );

  if (!role) {
    return "Warehouse Associate";
  }

  return role
    .split(" ")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

// -----------------------------------------------
// EMPLOYER PAY
// -----------------------------------------------

export function getWarehouseHourlyPay(
  fp: FounderProfile
): [number, number] | undefined {
  const min = fp.hourlyPayMin;
  const max = fp.hourlyPayMax;

  if (
    validHourlyPay(min) &&
    validHourlyPay(max) &&
    max >= min
  ) {
    return [min, max];
  }

  if (validHourlyPay(min) && max === undefined) {
    return [min, min];
  }

  if (validHourlyPay(max) && min === undefined) {
    return [max, max];
  }

  return fp.jd
    ? extractHourlyPay(fp.jd)
    : undefined;
}

// -----------------------------------------------
// WAREHOUSE JOB CARD
// -----------------------------------------------

export function warehouseJobCard(
  fp: FounderProfile
): string {
  const hourly = getWarehouseHourlyPay(fp);

  const pay = hourly
    ? hourly[0] === hourly[1]
      ? `${formatPay(hourly[0])}/hr`
      : `${formatPay(hourly[0])}-${formatPay(hourly[1])}/hr`
    : "Hourly pay to be confirmed";

  const location = [
    fp.city,
    fp.state,
  ]
    .filter(Boolean)
    .join(", ");

  const requirements = unique([
    ...(fp.requiredSkills ?? []),
    ...(fp.requiredEquipment ?? []),
    ...(fp.mustHaves ?? []),
  ]);

  const lines: string[] = [
    "WAREHOUSEJOBZ OPEN POSITION",
    `Company: ${fp.company}`,
    `Position: ${fp.roleTitle}`,
    `Pay: ${pay}`,
  ];

  if (location) {
    lines.push(`Location: ${location}`);
  }

  if (fp.shift) {
    lines.push(`Shift: ${fp.shift}`);
  }

  if (fp.shiftStart || fp.shiftEnd) {
    const hours = [
      fp.shiftStart,
      fp.shiftEnd,
    ]
      .filter(Boolean)
      .join(" - ");

    lines.push(`Shift hours: ${hours}`);
  }

  if (fp.employmentType) {
    lines.push(
      `Employment type: ${fp.employmentType}`
    );
  }

  if (fp.setup) {
    lines.push(
      `Work arrangement: ${fp.setup}`
    );
  }

  if (fp.workersNeeded !== undefined) {
    lines.push(
      `Positions available: ${fp.workersNeeded}`
    );
  }

  if (fp.startDate) {
    lines.push(
      `Expected start date: ${fp.startDate}`
    );
  }

  if (requirements.length > 0) {
    lines.push(
      `Required skills: ${requirements
        .slice(0, 8)
        .join(", ")}`
    );
  }

  if (fp.requiresVerifiedForkliftTraining) {
    lines.push(
      "Forklift training verification required"
    );
  }

  if (fp.success) {
    lines.push(
      `Job expectations: ${fp.success}`
    );
  }

  if (fp.pitch) {
    lines.push(
      `Additional details: ${fp.pitch}`
    );
  }

  if (fp.status) {
    lines.push(
      `Opening status: ${fp.status}`
    );
  }

  lines.push(
    "Next step: Confirm interest to request an employer introduction."
  );

  return lines.join("\n");
}

// -----------------------------------------------
// BACKWARD COMPATIBILITY
// -----------------------------------------------

/**
 * Original Wren export.
 *
 * Existing calls to roleCard(fp) continue working.
 */
export function roleCard(
  fp: FounderProfile
): string {
  return warehouseJobCard(fp);
}
