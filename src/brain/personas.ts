
import type { Intro, Person, Voice } from "../types.js";
import { pick } from "./voice.js";

/**
 * WAREHOUSEJOBZ AI
 * Warehouse Hiring Persona Simulator
 *
 * Simulates fictional:
 * - Warehouse hiring managers
 * - Distribution center recruiters
 * - Staffing coordinators
 * - Warehouse workers
 * - Forklift operators
 * - Order pickers and packers
 *
 * Used for testing:
 * - Worker-to-employer introductions
 * - Hiring manager decisions
 * - Hourly pay compatibility
 * - Shift compatibility
 * - Interview scheduling
 * - Hiring follow-up conversations
 *
 * IMPORTANT:
 * These are simulated personas, not real employers
 * or real job applicants.
 *
 * Keep simulations separate from production users.
 */

type Lines = Record<Voice, string[]>;

const YES: Lines = {
  crisp: [
    "Yes. Send the introduction.",
    "Looks qualified. Connect us.",
    "Yes. Let's schedule a screening.",
  ],
  warm: [
    "This looks promising! I'd love to meet {c}.",
    "Yes, please connect us. Thanks!",
    "Great! {c} sounds like a good fit for our warehouse.",
  ],
  hype: [
    "YES! We need workers like this!",
    "Let's go! Connect us ASAP!",
    "Perfect! Let's get {c} in for an interview!",
  ],
  dry: [
    "The {skill} experience checks out. Send the intro.",
    "Qualifications look relevant. Let's talk.",
    "Fine. Let's schedule a screening.",
  ],
  lowercase: [
    "yes send intro",
    "looks good. connect us",
    "yep let's talk",
  ],
  thoughtful: [
    "The experience looks relevant. I'd like to meet {c}.",
    "Yes, let's discuss the position and schedule.",
    "This looks like a promising match. Please connect us.",
  ],
};

const NO: Lines = {
  crisp: [
    "Pass. Not the right fit.",
    "No, thanks.",
    "Not for this opening.",
  ],
  warm: [
    "Thanks for sending {c}, but we'll pass for this position.",
    "Not quite what we need right now, but thank you!",
  ],
  hype: [
    "Close, but not the right fit for this shift!",
    "We'll pass this time. Keep the candidates coming!",
  ],
  dry: [
    "Pass. Missing a required qualification.",
    "Not enough relevant {skill} experience.",
  ],
  lowercase: [
    "pass for now",
    "not for this opening",
    "need someone with different experience",
  ],
  thoughtful: [
    "I'll pass on this one. We need a closer match to the job requirements.",
    "The background is interesting, but not quite right for this opening.",
  ],
};

const MORE: Lines = {
  crisp: [
    "What equipment have they operated?",
    "What shifts can they work?",
    "How much warehouse experience do they have?",
  ],
  warm: [
    "Could you tell me more about {c}'s warehouse experience?",
    "I'd love a little more information about their availability.",
  ],
  hype: [
    "Nice! Do they have forklift experience?",
    "This could work! What shifts are they available for?",
  ],
  dry: [
    "Which warehouse systems have they used?",
    "Have they operated {skill} equipment?",
    "What's their relevant experience?",
  ],
  lowercase: [
    "what shifts can they work?",
    "forklift experience?",
    "how many years in warehouse?",
  ],
  thoughtful: [
    "Could you share more about their equipment experience?",
    "Before I agree, can you confirm their preferred shifts?",
    "What relevant warehouse responsibilities have they handled?",
  ],
};

const FEEDBACK: Lines = {
  crisp: [
    "Good screening. Moving forward.",
    "Relevant experience. Next step.",
  ],
  warm: [
    "Great conversation! We'd like to continue the process.",
    "Really enjoyed speaking with them. Let's discuss next steps!",
  ],
  hype: [
    "Great interview! Let's move forward!",
    "Awesome! Ready for the next step!",
  ],
  dry: [
    "Experience matches. Continue screening.",
    "Good discussion. Proceed to the next stage.",
  ],
  lowercase: [
    "good interview. moving forward",
    "looks good. next step",
  ],
  thoughtful: [
    "The conversation went well. We'd like to continue evaluating the fit.",
    "Relevant background. Let's arrange the next step in our process.",
  ],
};

const WORKER_FEEDBACK: Lines = {
  crisp: [
    "Good conversation. Interested in next steps.",
    "The job sounds promising.",
  ],
  warm: [
    "That went well! I'd like to learn about the next step.",
    "Nice conversation. I'm interested in continuing!",
  ],
  hype: [
    "Great interview! I'm interested!",
    "Sounds good! What's next?",
  ],
  dry: [
    "Pay and shift sound workable.",
    "Interested, pending the final job details.",
  ],
  lowercase: [
    "went well. what's next?",
    "sounds good. interested",
  ],
  thoughtful: [
    "The conversation was helpful. I'd like to continue.",
    "I'm interested in learning more about the position.",
  ],
};

const GROUP_HELLO: Lines = {
  crisp: [
    "Hi {c}. Can you interview {s1} or {s2}?",
  ],
  warm: [
    "Hi {c}, great to meet you! Would {s1} or {s2} work for a quick interview?",
  ],
  hype: [
    "Hey {c}! Excited to connect! Can you do {s1} or {s2}?",
  ],
  dry: [
    "Hi {c}. Interview availability: {s1} or {s2}.",
  ],
  lowercase: [
    "hey {c}! can you do {s1} or {s2}?",
  ],
  thoughtful: [
    "Hi {c}, thanks for your interest. Would {s1} or {s2} work for an initial conversation?",
  ],
};

const GROUP_HELLO_NO_SLOTS: Lines = {
  crisp: [
    "Hi {c}. What times work for an interview?",
  ],
  warm: [
    "Hi {c}, great to meet you! When would you be available to talk?",
  ],
  hype: [
    "Hey {c}! Glad to connect! When can we chat?",
  ],
  dry: [
    "Hi {c}. Please share your interview availability.",
  ],
  lowercase: [
    "hey {c}! when can you talk?",
  ],
  thoughtful: [
    "Hi {c}, thanks for connecting. What times would work for an initial interview?",
  ],
};

const CANDIDATE_YES = [
  "Yes, I'm interested. Please connect me.",
  "That pay and shift sound good. I'd like an introduction.",
  "Yes, I'd like to learn more about the position.",
  "Sounds promising. Connect me with the hiring manager.",
];

const CANDIDATE_NO = [
  "I'll pass on this one. Please keep me in mind for other warehouse jobs.",
  "Not the right fit for my schedule.",
  "I'm looking for a different warehouse position.",
  "I'll pass for now, thanks.",
];

const CANDIDATE_MORE = [
  "What's the hourly pay?",
  "What shift is this position?",
  "Where is the warehouse located?",
  "Can you tell me more about the job requirements?",
];

const fill = (
  template: string,
  vars: Record<string, string>
): string =>
  template.replace(
    /\{(\w+)\}/g,
    (_, key: string) => vars[key] ?? ""
  );

export type PersonaMove =
  | {
      kind: "decide";
      answer: "yes" | "no" | "more";
      text: string;
    }
  | {
      kind: "feedback";
      text: string;
    }
  | {
      kind: "none";
    };

type WarehouseCandidate = NonNullable<
  Person["candidate"]
> & {
  desiredHourlyPay?: number;
  preferredShifts?: string[];
};

type WarehouseEmployer = NonNullable<
  Person["founder"]
> & {
  hourlyPayMin?: number;
  hourlyPayMax?: number;
  shift?: string;
  workersNeeded?: number;
  status?: string;
};

function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .trim()
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ");
}

function getMatchingSkill(
  candidate?: WarehouseCandidate,
  employer?: WarehouseEmployer
): string {
  if (!candidate || !employer) {
    return "warehouse";
  }

  const candidateSkills = new Set(
    candidate.skills.map(normalizeSkill)
  );

  const match = employer.mustHaves.find(
    (skill) => candidateSkills.has(normalizeSkill(skill))
  );

  return match ?? "warehouse";
}

function getEmployerPay(
  employer?: WarehouseEmployer
): [number, number] | undefined {
  if (!employer) return undefined;

  if (
    employer.hourlyPayMin !== undefined &&
    employer.hourlyPayMax !== undefined
  ) {
    return [
      employer.hourlyPayMin,
      employer.hourlyPayMax,
    ];
  }

  const jd = employer.jd ?? "";

  const range = jd.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hourly)?/i
  );

  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);

    if (min > 0 && max >= min && max <= 150) {
      return [min, max];
    }
  }

  const single = jd.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hourly)/i
  );

  if (single) {
    const pay = Number(single[1]);

    if (pay > 0 && pay <= 150) {
      return [pay, pay];
    }
  }

  return undefined;
}

function getEmployerShift(
  employer?: WarehouseEmployer
): string | undefined {
  if (!employer) return undefined;

  if (employer.shift) return employer.shift;

  const setup = employer.setup?.toLowerCase() ?? "";

  if (/first|1st|morning|day shift/.test(setup))
    return "first";

  if (/second|2nd|evening|afternoon/.test(setup))
    return "second";

  if (/third|3rd|night|overnight/.test(setup))
    return "third";

  if (/weekend/.test(setup))
    return "weekend";

  return undefined;
}

function workerNeedsMoreInfo(
  worker: WarehouseCandidate,
  employer: WarehouseEmployer
): boolean {
  const pay = getEmployerPay(employer);
  const shift = getEmployerShift(employer);

  if (!pay || !shift) return true;

  if (worker.desiredHourlyPay !== undefined) {
    if (pay[1] < worker.desiredHourlyPay) {
      return false;
    }
  }

  return false;
}

function workerHasHardMismatch(
  worker: WarehouseCandidate,
  employer: WarehouseEmployer
): boolean {
  const pay = getEmployerPay(employer);
  const shift = getEmployerShift(employer);

  if (
    pay &&
    worker.desiredHourlyPay !== undefined &&
    pay[1] < worker.desiredHourlyPay
  ) {
    return true;
  }

  if (
    shift &&
    worker.preferredShifts?.length &&
    !worker.preferredShifts.includes(shift) &&
    !worker.preferredShifts.includes("flexible")
  ) {
    return true;
  }

  return false;
}

/**
 * Simulated person's next move.
 *
 * Employer decisions depend on match score,
 * qualifications and configured pickiness.
 *
 * Worker decisions consider pay, shift and score.
 *
 * This function must only be used with fictional
 * personas in testing/simulation.
 */
export function personaMove(
  p: Person,
  intros: Intro[],
  other: (id: string) => Person | undefined,
  lastFromWren: string
): PersonaMove {
  const voice: Voice =
    p.persona?.voice ?? "thoughtful";

  const key =
    `${p.id}:${intros.length}:${lastFromWren.length}`;

  const awaiting = intros.find(
    (intro) => intro.awaiting?.includes(p.id)
  );

  if (awaiting) {
    return {
      kind: "feedback",
      text:
        p.role === "founder"
          ? pick(FEEDBACK[voice], key)
          : pick(WORKER_FEEDBACK[voice], key),
    };
  }

  // ---------------------------------------------
  // WAREHOUSE EMPLOYER DECISION
  // ---------------------------------------------

  if (p.role === "founder") {
    const ask = [...intros]
      .reverse()
      .find(
        (intro) =>
          intro.founderId === p.id &&
          intro.status === "asked_founder"
      );

    if (!ask) {
      return { kind: "none" };
    }

    const candidate = other(ask.candidateId);

    const cp = candidate?.candidate as
      | WarehouseCandidate
      | undefined;

    const fp = p.founder as
      | WarehouseEmployer
      | undefined;

    const skill = getMatchingSkill(cp, fp);

    const vars = {
      c: candidate?.first ?? "the worker",
      skill,
    };

    const pickiness =
      Math.max(
        0,
        Math.min(1, p.persona?.pickiness ?? 0.4)
      );

    const bar = 4 + pickiness * 6;

    const askedMore =
      /\b(want the intro|would you like an introduction|connect you|want an intro)\b/i.test(
        lastFromWren
      ) &&
      /\b(years? of experience|skills|experience includes)\b/i.test(
        lastFromWren
      );

    if (
      fp?.status === "closed" ||
      fp?.status === "filled" ||
      (fp?.workersNeeded !== undefined &&
        fp.workersNeeded <= 0)
    ) {
      return {
        kind: "decide",
        answer: "no",
        text: "This opening is no longer available.",
      };
    }

    if (
      fp &&
      cp &&
      workerHasHardMismatch(cp, fp)
    ) {
      return {
        kind: "decide",
        answer: "no",
        text: fill(
          pick(NO[voice], key),
          vars
        ),
      };
    }

    if (ask.score >= bar) {
      return {
        kind: "decide",
        answer: "yes",
        text: fill(
          pick(YES[voice], key),
          vars
        ),
      };
    }

    if (
      !askedMore &&
      ask.score >= bar - 3
    ) {
      return {
        kind: "decide",
        answer: "more",
        text: fill(
          pick(MORE[voice], key),
          vars
        ),
      };
    }

    if (
      askedMore &&
      ask.score >= bar - 3
    ) {
      return {
        kind: "decide",
        answer: "yes",
        text: fill(
          pick(YES[voice], key),
          vars
        ),
      };
    }

    return {
      kind: "decide",
      answer: "no",
      text: fill(
        pick(NO[voice], key),
        vars
      ),
    };
  }

  // ---------------------------------------------
  // WAREHOUSE WORKER DECISION
  // ---------------------------------------------

  const ask = [...intros]
    .reverse()
    .find(
      (intro) =>
        intro.candidateId === p.id &&
        intro.status === "asked_candidate"
    );

  if (!ask) {
    return { kind: "none" };
  }

  const employer = other(ask.founderId);

  const cp = p.candidate as
    | WarehouseCandidate
    | undefined;

  const fp = employer?.founder as
    | WarehouseEmployer
    | undefined;

  if (!cp || !fp) {
    return {
      kind: "decide",
      answer: "more",
      text: pick(CANDIDATE_MORE, key),
    };
  }

  if (workerHasHardMismatch(cp, fp)) {
    return {
      kind: "decide",
      answer: "no",
      text: pick(CANDIDATE_NO, key),
    };
  }

  if (workerNeedsMoreInfo(cp, fp)) {
    return {
      kind: "decide",
      answer: "more",
      text: pick(CANDIDATE_MORE, key),
    };
  }

  if (ask.score >= 6) {
    return {
      kind: "decide",
      answer: "yes",
      text: pick(CANDIDATE_YES, key),
    };
  }

  if (ask.score >= 4) {
    return {
      kind: "decide",
      answer: "more",
      text: pick(CANDIDATE_MORE, key),
    };
  }

  return {
    kind: "decide",
    answer: "no",
    text: pick(CANDIDATE_NO, key),
  };
}

/**
 * First simulated employer message in the
 * worker/employer introduction group.
 *
 * Uses real configured interview slots.
 * Does not invent interview availability.
 */
export function personaGroupHello(
  employer: Person,
  candidateFirst: string
): string {
  const voice: Voice =
    employer.persona?.voice ?? "thoughtful";

  const slots = (
    employer.founder?.slots ?? []
  ).filter(Boolean);

  if (slots.length === 0) {
    return fill(
      pick(GROUP_HELLO_NO_SLOTS[voice], employer.id),
      { c: candidateFirst }
    );
  }

  if (slots.length === 1) {
    return fill(
      pick(GROUP_HELLO[voice], employer.id),
      {
        c: candidateFirst,
        s1: slots[0],
        s2: "another time that works for you",
      }
    );
  }

  return fill(
    pick(GROUP_HELLO[voice], employer.id),
    {
      c: candidateFirst,
      s1: slots[0],
      s2: slots[1],
    }
  );
}
