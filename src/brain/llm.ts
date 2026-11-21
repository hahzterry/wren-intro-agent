import { Anthropic } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import type { Person } from "../types.js";
import { renderReasons } from "./match.js";
import {
  agreedSlot,
  extractName,
  extractSkills,
  extractVoucher,
  intent,
  isSmallTalkAck,
  mentionsAgent,
  readSide,
  statedName,
  type Intent,
} from "./text.js";
import { say } from "./voice.js";

/**
 * WAREHOUSEJOBZ AI
 *
 * AI-powered warehouse recruiting assistant.
 *
 * Features:
 * - Warehouse worker onboarding
 * - Employer onboarding
 * - Warehouse experience screening
 * - Equipment experience screening
 * - Hourly pay expectations
 * - Shift preferences
 * - Worker/employer matching
 * - Double-opt-in introductions
 * - Interview coordination
 *
 * Backward compatible with the original Brain API.
 */

const PERSONA = `
You are WarehouseJobz AI, a virtual warehouse recruiting
assistant connecting warehouse workers directly with
employers through text messaging.

You help warehouses find qualified, available workers.

You help workers find warehouse jobs matching their
experience, hourly pay expectations, location, and shifts.

SUPPORTED WAREHOUSE POSITIONS:
- Warehouse associates
- Forklift operators
- Reach truck operators
- Cherry picker operators
- Order pickers
- Packers
- Loaders and unloaders
- Material handlers
- Shipping associates
- Receiving associates
- Inventory associates
- Warehouse supervisors

COMMUNICATION STYLE:
- Friendly, direct, and professional.
- Sound like a helpful warehouse recruiter.
- Use short conversational text messages.
- Ask one question at a time whenever possible.
- Use first names.
- Avoid corporate jargon.
- Do not use markdown or long lists.
- Avoid unnecessary emojis.
- Clearly identify yourself as an AI assistant.

WORKER SCREENING:
- Ask about warehouse experience.
- Ask about equipment experience.
- Ask about preferred shifts.
- Ask about desired hourly pay.
- Ask about general work location.
- Ask about availability to start.
- Ask about relevant training when required.
- Never assume experience or qualifications.
- Never claim self-reported training is verified.

EMPLOYER SCREENING:
- Ask for company name.
- Ask for warehouse job title.
- Ask for hourly pay.
- Ask for warehouse location.
- Ask for shift hours.
- Ask for number of workers needed.
- Ask for start date.
- Ask for mandatory job qualifications.

MATCHING:
- Prioritize job-related qualifications.
- Consider hourly pay and preferred shifts.
- Consider availability and location.
- Explain why a match may be suitable.
- Do not guarantee employment.

PRIVACY:
- Require explicit consent before introductions.
- Do not share private contact details without consent.
- Do not reveal hidden worker pay preferences.
- Do not expose confidential employer information.
- Respect opt-outs.
- Do not reactivate messaging without valid renewed consent.

FAIR HIRING:
- Evaluate job-related qualifications only.
- Never use protected characteristics to rank workers.
- Do not infer protected traits from names or messages.
- Do not make final hiring decisions.
- Employers remain responsible for hiring decisions.
- Flag unclear qualifications for human review.
- Never claim eligibility verification has occurred
  unless the system confirms it.

SHIFT SAFETY:
- Never claim a worker is booked without confirmation.
- Never claim a worker attended a shift without evidence.
- Never invent job openings, pay rates, start dates,
  locations, interviews, or employer approvals.

GROUP CHAT:
- Introduce the worker and employer after both consent.
- Explain the position and next steps.
- Only respond when addressed or needed for logistics.
- Let the worker and employer communicate directly.
`;

type Effort = "low" | "medium" | "high";

export interface Pitch {
  toCandidate: string[];
  toFounder: string[];
  groupIntro: string[];
}

type Shift =
  | "first"
  | "second"
  | "third"
  | "weekend"
  | "flexible";

const ShiftSchema = z.enum([
  "first",
  "second",
  "third",
  "weekend",
  "flexible",
]);

const transcript = (
  lines: { who: string; text: string }[]
): string =>
  lines.map((line) => `${line.who}: ${line.text}`).join("\n");

/**
 * Extract a valid hourly wage.
 *
 * This is intentionally conservative.
 * Annual salaries and unrelated dollar amounts
 * should not be interpreted as hourly wages.
 */
function extractHourlyPay(
  text: string
): number | null {
  const explicit = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/\s*(?:hr|hour)|per\s+hour|hourly)/i
  );

  if (explicit) {
    const value = Number(explicit[1]);

    return value > 0 && value <= 150
      ? value
      : null;
  }

  const stated = text.match(
    /(?:minimum|at least|looking for|need|want|expect)\s*(?:around|about)?\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:an?\s*hour|hourly|\/hr)?/i
  );

  if (stated) {
    const value = Number(stated[1]);

    return value >= 7 && value <= 150
      ? value
      : null;
  }

  return null;
}

/**
 * Extract warehouse shift preferences.
 */
function extractShifts(text: string): Shift[] {
  const lower = text.toLowerCase();
  const shifts: Shift[] = [];

  if (
    /\b(first|1st|day|morning)\s*shift\b/.test(lower)
  ) {
    shifts.push("first");
  }

  if (
    /\b(second|2nd|evening|afternoon)\s*shift\b/.test(
      lower
    )
  ) {
    shifts.push("second");
  }

  if (
    /\b(third|3rd|night|overnight)\s*shift\b/.test(
      lower
    ) ||
    /\bovernight\b/.test(lower)
  ) {
    shifts.push("third");
  }

  if (/\bweekends?\b/.test(lower)) {
    shifts.push("weekend");
  }

  if (
    /\b(any shift|flexible|open availability)\b/.test(
      lower
    )
  ) {
    shifts.push("flexible");
  }

  return [...new Set(shifts)];
}

/**
 * Extract warehouse-specific skills.
 */
function warehouseSkills(text: string): string[] {
  const known = [
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
    "quality control",
    "wms",
  ];

  const lower = text.toLowerCase();

  return [
    ...new Set([
      ...extractSkills(text),
      ...known.filter((skill) =>
        lower.includes(skill)
      ),
    ]),
  ];
}

/**
 * Return employer hourly pay without inventing it.
 */
function employerHourlyPay(p: Person): string {
  const fp = p.founder;

  if (!fp) {
    return "Pay not confirmed";
  }

  const structured = fp as typeof fp & {
    hourlyPayMin?: number;
    hourlyPayMax?: number;
  };

  if (
    structured.hourlyPayMin !== undefined &&
    structured.hourlyPayMax !== undefined
  ) {
    return structured.hourlyPayMin ===
      structured.hourlyPayMax
      ? `$${structured.hourlyPayMin}/hr`
      : `$${structured.hourlyPayMin}-$${structured.hourlyPayMax}/hr`;
  }

  const jd = fp.jd ?? "";

  const range = jd.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hourly)?/i
  );

  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);

    if (
      low > 0 &&
      high >= low &&
      high <= 150
    ) {
      return `$${low}-$${high}/hr`;
    }
  }

  const single = jd.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hourly)/i
  );

  if (single) {
    const value = Number(single[1]);

    if (value > 0 && value <= 150) {
      return `$${value}/hr`;
    }
  }

  return "Pay not confirmed";
}

/**
 * Worker summary used for fallback introductions.
 */
function workerLine(p: Person): string {
  const cp = p.candidate;

  if (!cp) {
    return p.name;
  }

  const experience = cp.years
    ? `${cp.years} years of warehouse experience`
    : "warehouse job applicant";

  const skills = cp.skills.length
    ? `Reported skills include ${cp.skills
        .slice(0, 5)
        .join(", ")}.`
    : "";

  return `${p.name} has ${experience}. ${skills}`.trim();
}

/**
 * Main WarehouseJobz AI brain.
 *
 * IMPORTANT:
 * Uses the named Anthropic SDK export.
 *
 * This addresses:
 *
 * TS2709:
 * Cannot use namespace 'Anthropic' as a type.
 *
 * TS2351:
 * This expression is not constructable.
 */
export class Brain {
  private readonly client: Anthropic | undefined;

  constructor(
    readonly enabled: boolean,
    private readonly model: string,
    private readonly onLog: (
      msg: string
    ) => void = () => {}
  ) {
    if (enabled) {
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Execute a structured Claude request.
   *
   * Returns null when Claude is unavailable,
   * refuses, or encounters an API error.
   *
   * Other Brain methods provide local fallbacks.
   */
  private async ask<S extends z.ZodType>(
    name: string,
    schema: S,
    task: string,
    input: string,
    effort: Effort
  ): Promise<z.infer<S> | null> {
    if (!this.client) {
      return null;
    }

    const fallback =
      /opus|sonnet|fable|mythos/i.test(this.model)
        ? {
            betas: [
              "server-side-fallback-2026-07-01",
            ],
            fallbacks: "default" as const,
          }
        : {};

    try {
      const res =
        await this.client.beta.messages.parse({
          model: this.model,
          max_tokens: 8000,
          ...fallback,
          output_config: {
            effort,
            format: betaZodOutputFormat(schema),
          },
          system: [
            {
              type: "text",
              text: PERSONA,
              cache_control: {
                type: "ephemeral",
              },
            },
            {
              type: "text",
              text: task,
            },
          ],
          messages: [
            {
              role: "user",
              content: input,
            },
          ],
        });

      if (
        res.stop_reason === "refusal" ||
        res.stop_reason === "max_tokens"
      ) {
        this.onLog(
          `${name}: stop_reason=${res.stop_reason}, using fallback`
        );

        return null;
      }

      this.onLog(
        `${name}: Claude (${res.usage.input_tokens} in / ${res.usage.output_tokens} out)`
      );

      return res.parsed_output ?? null;
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        this.onLog(
          `${name}: rate limited`
        );
      } else if (
        err instanceof Anthropic.APIError
      ) {
        this.onLog(
          `${name}: API ${err.status} ${err.message.slice(0, 120)}`
        );
      } else {
        const message =
          err instanceof Error
            ? err.message
            : String(err);

        this.onLog(
          `${name}: ${message.slice(0, 160)}`
        );
      }

      return null;
    }
  }

  // ---------------------------------------------
  // WORKER INTERVIEW
  // ---------------------------------------------

  async interviewTurn(
    p: Person,
    question: string,
    answer: string,
    nextQuestion?: string
  ) {
    const schema = z.object({
      reply: z.string(),
      floorK: z.number().nullable(),
      setups: z.array(
        z.enum([
          "remote",
          "hybrid",
          "onsite",
        ])
      ),
      stages: z.array(
        z.enum([
          "seed",
          "series a",
          "series b",
          "series c",
        ])
      ),
      skills: z.array(z.string()),
      desiredHourlyPay: z.number().nullable(),
      preferredShifts: z.array(ShiftSchema),
      availableFrom: z.string().nullable(),
      equipmentExperience: z.array(z.string()),
    });

    const out = await this.ask(
      "warehouse_interview",
      schema,
      `You are interviewing a warehouse worker.

React briefly to their answer.

Extract:
- Warehouse experience
- Equipment skills
- Desired hourly pay
- Preferred shifts
- Availability to start

Never invent qualifications.

Return legacy fields for API compatibility:
floorK must always be null.
setups must be [].
stages must be [].

Ask the next question when provided.`,
      JSON.stringify({
        worker: {
          name: p.name,
          title: p.candidate?.title,
          skills: p.candidate?.skills,
        },
        question,
        answer,
        nextQuestion: nextQuestion ?? null,
      }),
      "low"
    );

    const hourly =
      out?.desiredHourlyPay ??
      extractHourlyPay(answer);

    const shifts =
      out?.preferredShifts?.length
        ? out.preferredShifts
        : extractShifts(answer);

    const skills =
      out?.skills?.length
        ? out.skills
        : warehouseSkills(answer);

    if (p.candidate) {
      const cp = p.candidate as
        typeof p.candidate & {
          desiredHourlyPay?: number;
          preferredShifts?: Shift[];
          availableFrom?: string;
          equipmentExperience?: string[];
        };

      if (
        hourly !== null &&
        hourly > 0 &&
        hourly <= 150
      ) {
        cp.desiredHourlyPay = hourly;
      }

      if (shifts.length) {
        cp.preferredShifts = [
          ...new Set([
            ...(cp.preferredShifts ?? []),
            ...shifts,
          ]),
        ];
      }

      if (out?.availableFrom) {
        cp.availableFrom =
          out.availableFrom;
      }

      const equipment =
        out?.equipmentExperience ?? [];

      if (equipment.length) {
        cp.equipmentExperience = [
          ...new Set([
            ...(cp.equipmentExperience ?? []),
            ...equipment,
          ]),
        ];
      }
    }

    const ack =
      say.feel(
        `${p.id}:${p.asked}`,
        answer
      ) ?? "Got it, thanks for sharing.";

    return {
      reply:
        out?.reply ??
        (nextQuestion
          ? `${ack} ${nextQuestion}`
          : ack),

      floorK: null,

      setups: [] as (
        | "remote"
        | "hybrid"
        | "onsite"
      )[],

      stages: [] as (
        | "seed"
        | "series a"
        | "series b"
        | "series c"
      )[],

      skills,
    };
  }

  // ---------------------------------------------
  // WORKER PROFILE
  // ---------------------------------------------

  async writeBlurb(
    p: Person
  ): Promise<string> {
    const c = p.candidate!;

    const out = await this.ask(
      "worker_blurb",
      z.object({
        blurb: z.string(),
      }),
      `Write a short warehouse worker profile
for a hiring manager.

Include:
- Job title
- Years of experience if known
- Relevant warehouse skills
- Equipment experience if known
- Shift preferences if known

Use only confirmed or clearly self-reported facts.
Never invent certifications.
Do not include private contact details.
Do not disclose pay expectations.`,
      JSON.stringify({
        name: p.name,
        candidate: c,
      }),
      "medium"
    );

    if (out?.blurb) {
      return out.blurb;
    }

    return workerLine(p);
  }

  async reviseBlurb(
    p: Person,
    request: string
  ): Promise<{
    blurb: string;
    hideComp: boolean;
  }> {
    const out = await this.ask(
      "revise_worker_blurb",
      z.object({
        blurb: z.string(),
        hideComp: z.boolean(),
      }),
      `Revise the warehouse worker profile
according to the worker's request.

Do not invent skills or qualifications.
Respect requests to hide compensation.`,
      JSON.stringify({
        currentBlurb: p.blurb,
        request,
      }),
      "low"
    );

    if (out) {
      return out;
    }

    return {
      blurb:
        p.blurb ?? workerLine(p),

      hideComp:
        p.hideComp ||
        /\b(pay|wage|salary|compensation|money)\b/i.test(
          request
        ),
    };
  }

  // ---------------------------------------------
  // INTENT CLASSIFICATION
  // ---------------------------------------------

  async classify(
    context: string,
    text: string
  ): Promise<Intent> {
    const quick = intent(text);

    if (
      quick === "yes" ||
      quick === "no"
    ) {
      return quick;
    }

    const out = await this.ask(
      "classify",
      z.object({
        intent: z.enum([
          "yes",
          "no",
          "more",
          "other",
        ]),
      }),
      `Classify a warehouse worker or
employer response.

yes = agrees
no = declines
more = requests additional information
other = unclear

Do not treat a question as acceptance.`,
      JSON.stringify({
        context,
        reply: text,
      }),
      "low"
    );

    return out?.intent ?? quick;
  }

  // ---------------------------------------------
  // WORKER / EMPLOYER ONBOARDING
  // ---------------------------------------------

  async readIntake(
    step: "name" | "side" | "voucher",
    text: string
  ): Promise<{
    name: string | null;
    side: "hiring" | "looking" | null;
    voucher: string | null;
  }> {
    const rules = () => {
      const n =
        step === "name"
          ? extractName(text)
          : statedName(text);

      const v =
        step === "voucher"
          ? extractVoucher(text)
          : undefined;

      return {
        name: n?.name ?? null,
        side: readSide(text) ?? null,
        voucher: v ?? null,
      };
    };

    const out = await this.ask(
      "warehouse_intake",
      z.object({
        name: z.string().nullable(),
        side: z
          .enum([
            "hiring",
            "looking",
          ])
          .nullable(),
        voucher: z.string().nullable(),
      }),
      `Identify whether this person is:
- A warehouse employer hiring workers
- A worker looking for warehouse employment

Extract their name only if stated.

The referral field is optional.
Never invent a referral.`,
      JSON.stringify({
        step,
        question: {
          name: "What should I call you?",
          side: "Are you hiring warehouse workers or looking for a warehouse job?",
          voucher: "Did someone refer you?",
        }[step],
        text,
      }),
      "low"
    );

    return out ?? rules();
  }

  // ---------------------------------------------
  // EMPLOYER / WORKER MATCH INTRODUCTIONS
  // ---------------------------------------------

  async pitch(
    c: Person,
    f: Person,
    reasons: string[]
  ): Promise<Pitch> {
    const fp = f.founder!;
    const pay = employerHourlyPay(f);

    const out = await this.ask(
      "warehouse_pitch",
      z.object({
        toCandidate: z.array(z.string()),
        toFounder: z.array(z.string()),
        groupIntro: z.array(z.string()),
      }),
      `Create a warehouse hiring introduction.

Candidate messages:
- Introduce the employer and job title.
- Explain hourly pay if confirmed.
- Mention location and shift if known.
- Explain why the job may fit.
- Ask permission to introduce them.

Employer messages:
- Introduce the interested worker.
- Summarize relevant experience.
- Ask permission to connect.

Group introduction:
- Introduce both parties.
- State job title and confirmed pay.
- Mention shift and location if known.
- Explain that the employer confirms next steps.

Never promise a job offer.
Never invent a start date.
Never share private numbers before consent.
Do not include unverified qualifications as facts.
Keep messages short.`,
      JSON.stringify({
        worker: {
          name: c.name,
          blurb: c.blurb,
          hideComp: c.hideComp,
          candidate: c.candidate,
        },
        employer: {
          name: f.name,
          company: fp.company,
          role: fp.roleTitle,
          hourlyPay: pay,
          setup: fp.setup,
          jd: fp.jd,
          slots: fp.slots,
        },
        reasons: renderReasons(
          reasons,
          c.first
        ),
      }),
      "medium"
    );

    if (
      out &&
      out.toCandidate.length &&
      out.toFounder.length &&
      out.groupIntro.length >= 2
    ) {
      return out;
    }

    const why = renderReasons(
      reasons,
      "you",
      2
    );

    const job =
      fp.roleTitle ||
      "Warehouse Associate";

    const company =
      fp.company ||
      "the employer";

    return {
      toCandidate: [
        `Hey ${c.first}, I found a warehouse opening that may fit your experience.`,

        `${company} is hiring for ${job}. Pay: ${pay}.${
          fp.setup
            ? ` Shift/location: ${fp.setup}.`
            : ""
        }`,

        `Here's why it may fit: ${why}.`,

        "Would you like me to introduce you to the hiring manager?",
      ],

      toFounder: [
        `Hi ${f.first}, I found a worker interested in your ${job} opening.`,

        c.blurb ??
          workerLine(c),

        `Would you like me to connect you with ${c.first}?`,
      ],

      groupIntro: [
        `WarehouseJobz AI is connecting ${c.first} and ${f.first}.`,

        `${c.first}, meet ${f.first} from ${company}.`,

        `Position: ${job}. Pay: ${pay}.${
          fp.setup
            ? ` Shift/location: ${fp.setup}.`
            : ""
        }`,

        workerLine(c),

        `You both agreed to connect. ${f.first}, please confirm the next hiring step and any interview or onboarding requirements.`,
      ],
    };
  }

  // ---------------------------------------------
  // ADDITIONAL JOB INFORMATION
  // ---------------------------------------------

  async moreAbout(
    asker: Person,
    other: Person
  ): Promise<string> {
    if (other.role === "founder") {
      const fp = other.founder!;

      return [
        `${fp.company} is hiring for ${fp.roleTitle}.`,

        `Pay: ${employerHourlyPay(other)}.`,

        fp.setup
          ? `Shift/location: ${fp.setup}.`
          : "",

        fp.mustHaves.length
          ? `Requirements: ${fp.mustHaves.join(", ")}.`
          : "",

        "Would you like an introduction?",
      ]
        .filter(Boolean)
        .join(" ");
    }

    const cp = other.candidate!;

    return [
      `${other.first} is interested in warehouse work.`,

      cp.years
        ? `${cp.years} years of experience.`
        : "",

      cp.skills.length
        ? `Skills: ${cp.skills
            .slice(0, 5)
            .join(", ")}.`
        : "",

      "Would you like an introduction?",
    ]
      .filter(Boolean)
      .join(" ");
  }

  // ---------------------------------------------
  // GROUP CHAT MANAGEMENT
  // ---------------------------------------------

  async gate(
    history: {
      who: string;
      text: string;
    }[],
    sender: string,
    text: string,
    offeredSlots: string[]
  ) {
    const ruleSlot = agreedSlot(
      text,
      offeredSlots
    );

    const out = await this.ask(
      "warehouse_group_gate",
      z.object({
        action: z.enum([
          "respond",
          "react",
          "ignore",
        ]),
        agreedSlot: z.string().nullable(),
      }),
      `You are in a warehouse hiring introduction chat.

Respond only when:
- Someone addresses the AI.
- Someone asks about the job details.
- Both people explicitly confirm a meeting time.

Ignore normal conversations between the
worker and hiring manager.

Do not confirm employment or shift booking.

Only return an agreedSlot when it exactly
matches one of the offered times.`,
      JSON.stringify({
        offeredSlots,
        conversation: transcript([
          ...history.slice(-12),
          {
            who: `${sender} (latest)`,
            text,
          },
        ]),
      }),
      "low"
    );

    const modelSlot =
      out?.agreedSlot &&
      offeredSlots.includes(out.agreedSlot)
        ? out.agreedSlot
        : null;

    if (out) {
      return {
        action:
          modelSlot || ruleSlot
            ? ("respond" as const)
            : out.action,

        slot:
          modelSlot ??
          ruleSlot ??
          null,
      };
    }

    if (ruleSlot) {
      return {
        action: "respond" as const,
        slot: ruleSlot,
      };
    }

    if (mentionsAgent(text)) {
      return {
        action: isSmallTalkAck(
          text.replace(
            /@?(wren|warehousejobz|warehousejobz ai)/i,
            ""
          )
        )
          ? ("react" as const)
          : ("respond" as const),

        slot: null,
      };
    }

    return {
      action: "ignore" as const,
      slot: null,
    };
  }

  // ---------------------------------------------
  // GROUP CHAT REPLIES
  // ---------------------------------------------

  async groupReply(
    history: {
      who: string;
      text: string;
    }[],
    context: object
  ): Promise<string> {
    const out = await this.ask(
      "warehouse_group_reply",
      z.object({
        reply: z.string(),
      }),
      `Reply as WarehouseJobz AI.

Answer the specific warehouse job question.

Use confirmed information only.

Do not invent:
- Pay rates
- Work schedules
- Job offers
- Start dates
- Worker qualifications
- Employer decisions

Keep the response to one or two sentences.`,
      JSON.stringify({
        context,
        chat: transcript(
          history.slice(-15)
        ),
      }),
      "low"
    );

    return (
      out?.reply ??
      "I can help with the job details and next steps. The hiring manager can confirm anything that hasn't been finalized."
    );
  }

  // ---------------------------------------------
  // GENERAL WORKER / EMPLOYER CHAT
  // ---------------------------------------------

  async chat(
    p: Person,
    history: {
      who: string;
      text: string;
    }[],
    status: string
  ): Promise<string> {
    const out = await this.ask(
      "warehouse_chat",
      z.object({
        reply: z.string(),
      }),
      `Reply as WarehouseJobz AI.

Use the provided hiring status.

If the worker asks about openings:
- Explain their current matching status.
- Do not invent available jobs.

If the employer asks about workers:
- Explain the current recruiting status.
- Do not promise placements.

Keep replies short and conversational.`,
      JSON.stringify({
        person: {
          name: p.name,

          role:
            p.role === "founder"
              ? "warehouse employer"
              : "warehouse worker",
        },

        status,

        chat: transcript(
          history.slice(-10)
        ),
      }),
      "low"
    );

    return out?.reply ?? status;
  }
}