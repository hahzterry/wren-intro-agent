
const WAREHOUSE_ROLES = [
  "forklift operator",
  "reach truck operator",
  "order picker",
  "picker",
  "packer",
  "warehouse associate",
  "material handler",
  "loader",
  "unloader",
  "shipping associate",
  "receiving associate",
  "inventory associate",
  "quality control",
  "warehouse supervisor",
];

const WAREHOUSE_SKILLS = [
  "forklift",
  "sit-down forklift",
  "stand-up forklift",
  "reach truck",
  "cherry picker",
  "pallet jack",
  "electric pallet jack",
  "rf scanner",
  "order picking",
  "packing",
  "loading",
  "unloading",
  "shipping",
  "receiving",
  "inventory",
  "cycle counting",
  "wms",
  "quality control",
  "heavy lifting",
];

const WAREHOUSE_SHIFTS = [
  "first shift",
  "second shift",
  "third shift",
  "overnight",
  "weekends",
  "part-time",
  "full-time",
];

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function extractWarehouseSkills(text: string): string[] {
  const lower = text.toLowerCase();

  return WAREHOUSE_SKILLS.filter((skill) =>
    lower.includes(skill)
  );
}

export function extractWarehouseShift(text: string): string[] {
  const lower = text.toLowerCase();

  return WAREHOUSE_SHIFTS.filter((shift) =>
    lower.includes(shift)
  );
}

export function extractHourlyPay(
  text: string
): [number, number] | undefined {
  const range = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|to|–)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i
  );

  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);

    if (low > 0 && high >= low && high <= 150) {
      return [low, high];
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

export function extractWarehouseRole(text: string): string {
  const lower = text.toLowerCase();

  return (
    WAREHOUSE_ROLES.find((role) => lower.includes(role)) ??
    "Warehouse Associate"
  );
}

export function warehouseJobCard(
  fp: FounderProfile
): string {
  const hourly = fp.jd
    ? extractHourlyPay(fp.jd)
    : undefined;

  const pay = hourly
    ? hourly[0] === hourly[1]
      ? `$${hourly[0]}/hr`
      : `$${hourly[0]}-$${hourly[1]}/hr`
    : "Hourly pay to be confirmed";

  return [
    `WAREHOUSEJOBZ OPEN POSITION`,
    `Company: ${fp.company}`,
    `Position: ${fp.roleTitle}`,
    `Pay: ${pay}`,
    fp.setup ? `Location / Shift: ${fp.setup}` : "",
    fp.mustHaves.length
      ? `Required skills: ${fp.mustHaves.slice(0, 8).join(", ")}`
      : "",
    fp.success
      ? `Job expectations: ${fp.success}`
      : "",
    fp.pitch
      ? `Additional details: ${fp.pitch}`
      : "",
    `Next step: Confirm interest to request an employer introduction.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Preserve the original export used by existing modules.
export function roleCard(fp: FounderProfile): string {
  return warehouseJobCard(fp);
}
