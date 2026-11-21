import { randomUUID } from "node:crypto";
import type { Store } from "../store.js";
import {
  TransportUnsupported,
  type Transport,
} from "../transports/types.js";
import type {
  FounderProfile,
  InboundEvent,
  Intro,
  Person,
} from "../types.js";
import {
  CANDIDATE_QUESTIONS,
  parseJD,
  parseResume,
  ROLE_QUESTIONS,
  soundsLikeSkip,
} from "./intake.js";
import type { Brain } from "./llm.js";
import {
  MIN_SCORE,
  rankCandidates,
  rankFounders,
  renderReasons,
} from "./match.js";
import {
  personaGroupHello,
  personaMove,
} from "./personas.js";
import {
  extractFloorK,
  extractSetups,
  extractSkills,
  isOptOut,
} from "./text.js";
import { say } from "./voice.js";

export interface AgentOptions {
  matchDelayMs: number;
  followupDelayMs: number;
  personaDelayMs?: number;
}

type WarehouseEmployer = FounderProfile & {
  hourlyPayMin?: number;
  hourlyPayMax?: number;
  city?: string;
  state?: string;
  shift?: string;
  workersNeeded?: number;
  startDate?: string;
  employmentType?: string;
  requiredEquipment?: string[];
  status?: string;
};

type WarehouseWorker = NonNullable<Person["candidate"]> & {
  desiredHourlyPay?: number;
  preferredShifts?: string[];
  availableFrom?: string;
  equipmentExperience?: string[];
};

const DEFAULT_SLOTS = ["Thu 10:00 AM", "Fri 2:00 PM"];

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function hourlyPay(
  text: string
): [number, number] | undefined {
  const range = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|—|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i
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
    const pay = Number(single[1]);
    if (pay > 0 && pay <= 150) {
      return [pay, pay];
    }
  }

  return undefined;
}

function warehouseShifts(text: string): string[] {
  const lower = text.toLowerCase();
  const shifts: string[] = [];

  if (/\b(first|1st|day)\s*shift\b/.test(lower))
    shifts.push("first shift");

  if (/\b(second|2nd|evening)\s*shift\b/.test(lower))
    shifts.push("second shift");

  if (
    /\b(third|3rd|night)\s*shift\b/.test(lower) ||
    /\bovernight\b/.test(lower)
  )
    shifts.push("third shift");

  if (/\bweekends?\b/.test(lower))
    shifts.push("weekends");

  return unique(shifts);
}

function updateEmployer(
  fp: WarehouseEmployer,
  text: string
): void {
  const pay = hourlyPay(text);
  if (pay) {
    fp.hourlyPayMin = pay[0];
    fp.hourlyPayMax = pay[1];
  }

  const shifts = warehouseShifts(text);
  if (shifts.length) fp.shift = shifts[0];

  const count = text.match(
    /\b(?:need|hiring|seeking)\s+(\d{1,3})\s+(?:workers?|people|associates?|operators?)\b/i
  );
  if (count) fp.workersNeeded = Number(count[1]);

  const skills = extractSkills(text);
  fp.mustHaves = unique([...fp.mustHaves, ...skills]);
}

function updateWorker(
  c: WarehouseWorker,
  text: string
): void {
  c.skills = unique([
    ...c.skills,
    ...extractSkills(text),
  ]);

  const shifts = warehouseShifts(text);
  if (shifts.length) {
    c.preferredShifts = unique([
      ...(c.preferredShifts ?? []),
      ...shifts,
    ]);
  }

  const pay = hourlyPay(text);
  if (pay) c.desiredHourlyPay = pay[0];

  if (/\b(asap|immediately|right away)\b/i.test(text)) {
    c.availableFrom = "Immediately";
  }
}

function compatible(
  worker: Person,
  employer: Person
): boolean {
  const c = worker.candidate as WarehouseWorker | undefined;
  const f = employer.founder as WarehouseEmployer | undefined;

  if (!c || !f) return false;
  if (f.status === "closed" || f.status === "filled")
    return false;
  if (f.workersNeeded !== undefined && f.workersNeeded <= 0)
    return false;

  if (
    c.desiredHourlyPay !== undefined &&
    f.hourlyPayMax !== undefined &&
    c.desiredHourlyPay > f.hourlyPayMax
  ) return false;

  if (
    f.shift &&
    c.preferredShifts?.length &&
    !c.preferredShifts.includes(f.shift)
  ) return false;

  return true;
}

function approved(text: string): boolean {
  return /^(yes|yep|yeah|correct|approved|confirm|perfect|looks good|looks great|looks right|all good|no changes|nope)[.! ]*$/i.test(
    text.trim()
  );
}

export class Agent {
  private queues = new Map<string, Promise<void>>();
  private timers = new Set<NodeJS.Timeout>();

  constructor(
    private store: Store,
    private t: Transport,
    private brain: Brain,
    private opts: AgentOptions
  ) {}

  handle(e: InboundEvent): Promise<void> {
    const prev =
      this.queues.get(e.chatId) ?? Promise.resolve();

    const next = prev
      .then(() => this.process(e))
      .catch((err) =>
        this.store.addLog(
          "error",
          `${e.chatId}: ${(err as Error).stack ?? err}`
        )
      );

    this.queues.set(e.chatId, next);
    return next;
  }

  async idle(): Promise<void> {
    await Promise.all([...this.queues.values()]);
  }

  stop(): void {
    for (const timer of this.timers)
      clearTimeout(timer);
    this.timers.clear();
  }

  private later(
    ms: number,
    fn: () => Promise<void>
  ): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn().catch((err) =>
        this.store.addLog("error", String(err))
      );
    }, ms);

    this.timers.add(timer);
  }

  private isPersona(p: Person): boolean {
    return Boolean(
      p.simulated ||
      (p.fictional && this.t.name !== "sim")
    );
  }

  private canGroupWith(...ps: Person[]): boolean {
    return (
      this.t.name === "sim" ||
      !ps.some((p) => this.isPersona(p))
    );
  }

  private async process(e: InboundEvent): Promise<void> {
    e = {
      ...e,
      text: e.text
        .replace(/[‘’ʼ]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/…/g, "..."),
    };

    const s = this.store;
    const chat = s.ensureChat(e.chatId, {
      handles: e.isGroup
        ? e.participants ?? [e.from]
        : [e.from],
      isGroup: e.isGroup,
    });

    if (e.isGroup && !chat.handles.includes(e.from))
      chat.handles.push(e.from);

    s.pushMessage(chat.id, {
      id: e.messageId ?? randomUUID(),
      from: e.from,
      text: e.text,
      at: new Date().toISOString(),
    });

    const who = s.byHandle(e.from);
    s.addLog(
      "inbound",
      `${who?.first || e.from}: ${e.text}`
    );

    if (e.isGroup) return this.onGroup(e);

    if (/^(hello photon|ping)[.!]*$/i.test(e.text.trim())) {
      const via =
        this.t.name === "spectrum"
          ? "Photon Spectrum"
          : this.t.name;

      await this.say(
        chat.id,
        `${via} is connected. You said: ${e.text}`
      );
      return;
    }

    return this.onDM(e);
  }

  private async onDM(e: InboundEvent): Promise<void> {
    let p = this.store.byHandle(e.from);

    if (isOptOut(e.text)) {
      if (p) {
        p.optedOut = true;
        this.store.save();
      }
      return;
    }

    if (p?.optedOut) {
      if (!/^(start|unstop|subscribe)$/i.test(e.text.trim()))
        return;

      p.optedOut = false;
      this.store.save();
      await this.dm(
        p,
        "WarehouseJobz AI messages are enabled again."
      );
      return;
    }

    if (!p) {
      p = this.store.addPerson({
        id: `c_${randomUUID().slice(0, 8)}`,
        handle: e.from,
        name: "",
        first: "",
        role: "candidate",
        stage: "naming",
        asked: 0,
        notes: [],
        candidate: {
          title: "",
          years: 0,
          skills: [],
        },
      });

      await this.dm(p, say.helloStranger(p.id));
      return;
    }

    const waiting = this.store.intros.find(
      (i) => i.awaiting?.includes(p!.id)
    );
    if (waiting)
      return this.onAwaitedAnswer(p, waiting, e.text);

    if (
      p.stage === "naming" ||
      (p.stage === "new" &&
        !p.vouch &&
        (!p.first || p.first === "there"))
    )
      return this.onName(p, e.text);

    switch (p.stage) {
      case "side":
        return this.onSide(p, e.text);
      case "company":
        return this.onCompany(p, e.text);
      case "jd":
        return this.onJD(p, e.text);
      case "role_interview":
        return this.onRoleAnswer(p, e.text);
      case "role_review":
        return this.onRoleReview(p, e.text);
      case "new":
        if (!p.vouch)
          return this.onVoucher(p, e.text);
        return this.startInterview(p);
      case "resume":
        return this.onResume(p, e.text);
      case "interviewing":
        return this.onInterviewAnswer(p, e.text);
      case "blurb_review":
        return this.onBlurbReview(p, e.text);
      case "ready": {
        if (p.role === "founder") {
          const ask = this.store.openIntroFor(
            p.id,
            ["asked_founder"]
          );
          if (ask)
            return this.onFounderAnswer(ask, e.text);
        } else {
          const ask = this.store.openIntroFor(
            p.id,
            ["asked_candidate"]
          );
          if (ask)
            return this.onCandidateAnswer(ask, e.text);
        }
        return this.smallTalk(p);
      }
    }
  }

  private async onName(
    p: Person,
    text: string
  ): Promise<void> {
    const r = await this.brain.readIntake("name", text);

    if (!r.name)
      return this.dm(
        p,
        say.askNameAgain(`${p.id}:${text.length}`)
      );

    p.name = r.name;
    p.first = r.name.split(/\s+/)[0];

    if (r.side === "hiring")
      return this.becomeHiring(p);

    if (r.side === "looking")
      return this.toVoucherStep(p);

    p.stage = "side";
    this.store.save();
    await this.dm(p, say.askSide(p.id, p.first));
  }

  private async onSide(
    p: Person,
    text: string
  ): Promise<void> {
    const r = await this.brain.readIntake("side", text);

    if (r.name && r.name !== p.name) {
      p.name = r.name;
      p.first = r.name.split(/\s+/)[0];
      this.store.save();
    }

    if (r.side === "hiring")
      return this.becomeHiring(p);

    if (r.side === "looking")
      return this.toVoucherStep(p);

    await this.dm(p, say.askSideAgain);
  }

  private async toVoucherStep(p: Person): Promise<void> {
    p.stage = "new";
    this.store.save();
    await this.dm(p, say.askVoucher(p.id, p.first));
  }

  private async onVoucher(
    p: Person,
    text: string
  ): Promise<void> {
    const r = await this.brain.readIntake("voucher", text);

    if (!r.voucher)
      return this.dm(p, say.askVoucherAgain);

    const nobody = r.voucher.toLowerCase() === "nobody";

    p.vouch = nobody
      ? {
          name: "no one",
          relation: "found WarehouseJobz directly",
          quote: "",
        }
      : {
          name: r.voucher,
          relation: "self-reported referral",
          quote: "",
        };

    p.stage = "resume";
    this.store.save();

    await this.dm(
      p,
      nobody
        ? say.noVoucher
        : say.thanksVoucher(p.id, {
            first: p.first,
            voucher: r.voucher,
          }),
      say.resumeAsk(p.id)
    );
  }

  private async becomeHiring(p: Person): Promise<void> {
    p.role = "founder";
    p.candidate = undefined;

    p.founder = {
      company: "",
      stage: "early-stage",
      sector: "warehouse logistics",
      roleTitle: "",
      bandK: [0, 0],
      equity: "",
      setup: "onsite",
      mustHaves: [],
      problem: "",
      slots: DEFAULT_SLOTS,
    };

    p.stage = "company";
    this.store.save();
    await this.dm(p, say.askCompany(p.id, p.first));
  }

  private async onCompany(
    p: Person,
    text: string
  ): Promise<void> {
    p.founder!.company = text
      .trim()
      .replace(/^(it'?s|we'?re|i'?m at|at)\s+/i, "")
      .replace(/[.!]+$/, "")
      .slice(0, 100);

    p.stage = "jd";
    this.store.save();

    await this.dm(
      p,
      say.askJD(p.id, p.founder!.company)
    );
  }

  private async onJD(
    p: Person,
    text: string
  ): Promise<void> {
    const fp = p.founder as WarehouseEmployer;
    const parsed = parseJD(text);

    fp.jd = text.slice(0, 4000);
    fp.roleTitle =
      parsed.roleTitle || fp.roleTitle || "Warehouse Associate";

    if (parsed.setup) fp.setup = parsed.setup;

    updateEmployer(fp, text);

    p.stage = "role_interview";
    p.asked = 1;
    this.store.save();

    await this.dm(
      p,
      say.jdRead(p.id, fp.roleTitle),
      ROLE_QUESTIONS[0].ask
    );
  }

  private async onRoleAnswer(
    p: Person,
    text: string
  ): Promise<void> {
    const fp = p.founder as WarehouseEmployer;
    const q = ROLE_QUESTIONS[p.asked - 1];
    if (!q) return;

    if (q.key === "success") {
      fp.success = text;
      fp.problem =
        `Job expectations: ${lowerFirst(text)}`;
    }

    if (q.key === "antiPattern") {
      fp.antiPattern = text;
      fp.mustHaves = unique([
        ...fp.mustHaves,
        ...extractSkills(text),
      ]);
    }

    if (q.key === "pitch")
      fp.pitch = text;

    if (q.key === "practical")
      updateEmployer(fp, text);

    const next = ROLE_QUESTIONS[p.asked];

    if (next) {
      p.asked += 1;
      this.store.save();
      return this.dm(
        p,
        `${say.ackRole(`${p.id}:${p.asked}`)} ${next.ask}`
      );
    }

    p.stage = "role_review";
    this.store.save();

    await this.dm(
      p,
      say.roleCardIntro(p.id),
      roleCard(fp),
      say.blurbAsk
    );
  }

  private async onRoleReview(
    p: Person,
    text: string
  ): Promise<void> {
    const fp = p.founder as WarehouseEmployer;

    const decision = await this.brain.classify(
      "Anything you'd change about the role card?",
      text
    );

    if (
      decision === "yes" ||
      /looks (good|right|great)|^(no|nope|nah)[,.! ]*(looks|all)?\s*(good|great|right|fine)?[.! ]*$/i.test(
        text.trim()
      )
    ) {
      p.stage = "ready";
      this.store.save();

      await this.dm(p, say.roleReady(p.id));
      this.later(
        this.opts.matchDelayMs,
        () => this.proposeCandidateTo(p)
      );
      return;
    }

    updateEmployer(fp, text);
    fp.pitch = [fp.pitch, text]
      .filter(Boolean)
      .join(" ");

    this.store.save();

    await this.dm(
      p,
      say.blurbUpdated,
      roleCard(fp),
      say.blurbConfirm
    );
  }

  async proposeCandidateTo(f: Person): Promise<void> {
    if (f.optedOut) return;

    const ranked = rankCandidates(
      f,
      this.store.people,
      this.store.intros
    );

    const top = ranked.find(
      (r) =>
        r.score >= MIN_SCORE &&
        !r.candidate.optedOut &&
        compatible(r.candidate, f)
    );

    if (!top)
      return this.dm(f, say.noCandidate(f.id));

    const c = top.candidate;
    const pitch = await this.brain.pitch(
      c,
      f,
      top.reasons
    );

    const intro: Intro = {
      id: `i_${randomUUID().slice(0, 8)}`,
      candidateId: c.id,
      founderId: f.id,
      status: "asked_founder",
      initiatedBy: "founder",
      reasons: top.reasons.map((r) =>
        renderReasons([r], c.first)
      ),
      score: top.score,
      pitch,
      feedback: {},
      createdAt: new Date().toISOString(),
    };

    this.store.addIntro(intro);

    const anonymous = (text: string) =>
      text
        .split(c.name).join("This worker")
        .split(c.first).join("they");

    await this.dm(
      f,
      say.foundCandidate(f.id),
      anonymous(
        c.blurb ?? c.candidate?.title ?? "Warehouse worker"
      ),
      `Why I think so: ${renderReasons(
        top.reasons,
        "this worker",
        2
      )}.`,
      say.askReachOut
    );
  }

  async kickoff(personId: string): Promise<void> {
    const p = this.store.person(personId);
    if (!p) throw new Error(`no person ${personId}`);
    if (p.optedOut) return;

    if (p.role === "candidate" && p.stage === "new")
      return this.startInterview(p);

    if (p.role === "candidate" && p.stage === "ready")
      return this.proposeNext(p);

    if (
      p.role === "founder" &&
      p.stage === "ready" &&
      p.founder?.roleTitle
    )
      return this.proposeCandidateTo(p);

    await this.dm(
      p,
      `Hi ${p.first}, it's WarehouseJobz AI. I'll text you when I find a relevant warehouse opportunity.`
    );
  }

  private async onResume(
    p: Person,
    text: string
  ): Promise<void> {
    const c = p.candidate as WarehouseWorker;

    if (!soundsLikeSkip(text)) {
      const r = parseResume(text);
      c.resume = text.slice(0, 4000);

      if (r.title) c.title = r.title;
      if (r.years) c.years = r.years;

      updateWorker(c, text);

      await this.dm(p, say.resumeRead(p.id));
    } else {
      await this.dm(p, say.resumeSkipped(p.id));
    }

    return this.startInterview(p, true);
  }

  private async startInterview(
    p: Person,
    afterResume = false
  ): Promise<void> {
    p.stage = "interviewing";
    p.asked = 1;
    this.store.save();

    const first =
      `${say.interviewIntro(CANDIDATE_QUESTIONS.length)} ` +
      CANDIDATE_QUESTIONS[0].ask;

    if (p.vouch?.quote && !afterResume) {
      await this.dm(
        p,
        say.helloVouched(p.id, {
          first: p.first,
          voucher: p.vouch.name,
          quote: p.vouch.quote,
        }),
        say.whoAmI(p.id),
        first
      );
    } else {
      await this.dm(p, first);
    }
  }

  private async onInterviewAnswer(
    p: Person,
    text: string
  ): Promise<void> {
    const q = CANDIDATE_QUESTIONS[p.asked - 1];
    if (!q) return;

    const c = p.candidate as WarehouseWorker;

    if (q.key === "proudest") c.proudest = text;
    if (q.key === "whyLeave") c.whyLeave = text;
    if (q.key === "energy") c.energy = text;

    updateWorker(c, text);

    const next = CANDIDATE_QUESTIONS[p.asked]?.ask;
    const r = await this.brain.interviewTurn(
      p,
      q.ask,
      text,
      next
    );

    if (r.skills.length) {
      c.skills = unique([
        ...c.skills,
        ...r.skills.map((s) => s.toLowerCase()),
      ]);
    }

    if (next) {
      p.asked += 1;
      this.store.save();
      return this.dm(p, r.reply);
    }

    p.blurb = await this.brain.writeBlurb(p);
    p.stage = "blurb_review";
    this.store.save();

    await this.dm(
      p,
      r.reply,
      say.blurbIntro(p.id),
      p.blurb,
      say.blurbAsk
    );
  }

  private async onBlurbReview(
    p: Person,
    text: string
  ): Promise<void> {
    const decision = await this.brain.classify(
      "Anything you'd change about the blurb?",
      text
    );

    if (
      decision === "yes" ||
      /^(no|nope|nah)[,.! ]*(looks|it's|all)?\s*(good|great|right|fine)?[.! ]*$/i.test(
        text.trim()
      ) ||
      /looks (good|right|great)/i.test(text)
    ) {
      p.stage = "ready";
      this.store.save();

      await this.dm(p, say.ready(p.id));
      this.later(
        this.opts.matchDelayMs,
        () => this.proposeNext(p)
      );
      return;
    }

    const r = await this.brain.reviseBlurb(p, text);
    p.blurb = r.blurb;
    p.hideComp = p.hideComp || r.hideComp;
    this.store.save();

    await this.dm(
      p,
      r.hideComp
        ? say.blurbHidden
        : say.blurbUpdated,
      ...(r.hideComp ? [] : [p.blurb]),
      say.blurbConfirm
    );
  }

  async proposeNext(c: Person): Promise<void> {
    if (c.optedOut) return;

    const ranked = rankFounders(
      c,
      this.store.people,
      this.store.intros
    );

    const top = ranked.find(
      (r) =>
        r.score >= MIN_SCORE &&
        !r.founder.optedOut &&
        compatible(c, r.founder)
    );

    if (!top)
      return this.dm(c, say.noMatch(c.id));

    const pitch = await this.brain.pitch(
      c,
      top.founder,
      top.reasons
    );

    const intro: Intro = {
      id: `i_${randomUUID().slice(0, 8)}`,
      candidateId: c.id,
      founderId: top.founder.id,
      status: "asked_candidate",
      initiatedBy: "candidate",
      reasons: top.reasons.map((r) =>
        renderReasons([r], c.first)
      ),
      score: top.score,
      pitch,
      feedback: {},
      createdAt: new Date().toISOString(),
    };

    this.store.addIntro(intro);
    await this.dm(c, ...pitch.toCandidate);
  }

  private async onCandidateAnswer(
    intro: Intro,
    text: string
  ): Promise<void> {
    const c = this.store.person(intro.candidateId)!;
    const f = this.store.person(intro.founderId)!;

    const answer = await this.brain.classify(
      `Want an intro to ${f.name}?`,
      text
    );

    const founderFirst =
      intro.initiatedBy === "founder";

    if (answer === "yes") {
      if (founderFirst) return this.connect(intro);

      intro.status = "asked_founder";
      this.store.save();

      await this.dm(
        c,
        say.checkingFounder(c.id, f.first)
      );
      await this.dm(f, ...intro.pitch!.toFounder);
      return;
    }

    if (answer === "no") {
      intro.status = "declined_candidate";

      if (founderFirst)
        await this.dm(
          f,
          say.candidatePassToFounder(f.id, c.first)
        );

      if (text.trim().split(/\s+/).length > 3) {
        intro.feedback[c.id] = text;
        this.store.save();

        await this.dm(
          c,
          say.candidatePassNoted(c.id)
        );

        if (!founderFirst)
          this.later(
            this.opts.matchDelayMs,
            () => this.proposeNext(c)
          );
      } else {
        intro.awaiting = [c.id];
        this.store.save();
        await this.dm(c, say.candidatePass(c.id));
      }

      if (founderFirst)
        this.later(
          this.opts.matchDelayMs,
          () => this.proposeCandidateTo(f)
        );

      return;
    }

    if (answer === "more")
      return this.dm(
        c,
        await this.brain.moreAbout(c, f)
      );

    return this.dm(c, say.nudge(f.first, false));
  }

  private async onFounderAnswer(
    intro: Intro,
    text: string
  ): Promise<void> {
    const c = this.store.person(intro.candidateId)!;
    const f = this.store.person(intro.founderId)!;

    const answer = await this.brain.classify(
      `Want the intro to ${c.name}?`,
      text
    );

    const founderFirst =
      intro.initiatedBy === "founder";

    if (answer === "yes") {
      if (!founderFirst) return this.connect(intro);

      intro.status = "asked_candidate";
      this.store.save();

      await this.dm(f, say.checkingCandidate(f.id));
      await this.dm(c, ...intro.pitch!.toCandidate);
      return;
    }

    if (answer === "no") {
      intro.status = "declined_founder";
      this.store.save();

      await this.dm(
        f,
        say.founderPassToFounder(f.id)
      );

      if (founderFirst)
        this.later(
          this.opts.matchDelayMs,
          () => this.proposeCandidateTo(f)
        );
      else {
        await this.dm(
          c,
          say.founderPassToCandidate(c.id, f.first)
        );
        this.later(
          this.opts.matchDelayMs,
          () => this.proposeNext(c)
        );
      }
      return;
    }

    if (answer === "more") {
      const more = await this.brain.moreAbout(f, c);
      return this.dm(f, more);
    }

    return this.dm(
      f,
      founderFirst
        ? say.askReachOut
        : say.nudge(c.first, true)
    );
  }

  private async connect(intro: Intro): Promise<void> {
    const c = this.store.person(intro.candidateId)!;
    const f = this.store.person(intro.founderId)!;

    if (c.optedOut || f.optedOut || !compatible(c, f))
      return;

    const [opener, ...rest] =
      intro.pitch!.groupIntro;

    if (!this.canGroupWith(c, f)) {
      intro.status = "connected";
      this.store.save();

      const real = [c, f].filter(
        (p) => !this.isPersona(p)
      );

      for (const p of real) {
        await this.dm(
          p,
          say.demoIntroNote(
            p.id,
            (p === c ? f : c).first
          ),
          ...rest
        );
      }

      this.later(
        this.opts.followupDelayMs,
        () => this.followUp(intro)
      );
      return;
    }

    await this.dm(c, say.founderIn(c.id, f.first));

    if (intro.initiatedBy === "founder")
      await this.dm(
        f,
        say.founderIn(f.id, c.first)
      );

    try {
      const displayName =
        `${c.first} & ${f.first} 🤝`;

      const { chatId, messageId } =
        await this.t.createGroup(
          [c.handle, f.handle],
          opener,
          displayName
        );

      this.store.ensureChat(chatId, {
        handles: [c.handle, f.handle],
        isGroup: true,
        displayName,
        introId: intro.id,
      });

      this.record(chatId, opener, messageId);

      for (const line of rest)
        await this.say(chatId, line);

      intro.chatId = chatId;
      intro.status = "connected";
      this.store.save();

      for (const p of [f, c]) {
        if (!this.isPersona(p)) continue;

        const other = p === f ? c : f;

        this.later(
          this.opts.personaDelayMs ?? 3000,
          () =>
            this.handle({
              chatId,
              isGroup: true,
              from: p.handle,
              text:
                p === f
                  ? personaGroupHello(f, c.first)
                  : `Hi ${other.first}! Glad WarehouseJobz connected us.`,
              messageId: randomUUID(),
              participants: [c.handle, f.handle],
            })
        );
      }
    } catch (err) {
      if (!(err instanceof TransportUnsupported))
        throw err;

      intro.status = "connected";
      this.store.save();

      await this.dm(
        c,
        `The employer agreed to connect. ${f.first}'s contact is ${f.handle}.`
      );

      await this.dm(
        f,
        `The worker agreed to connect. ${c.first}'s contact is ${c.handle}.`
      );

      this.later(
        this.opts.followupDelayMs,
        () => this.followUp(intro)
      );
    }
  }

  private async onGroup(e: InboundEvent): Promise<void> {
    const chat = this.store.chat(e.chatId)!;

    const intro = chat.introId
      ? this.store.intro(chat.introId)
      : undefined;

    const f = intro
      ? this.store.person(intro.founderId)
      : undefined;

    const history = chat.messages
      .slice(0, -1)
      .map((m) => ({
        who: this.nameOf(m.from),
        text: m.text,
      }));

    const g = await this.brain.gate(
      history,
      this.nameOf(e.from),
      e.text,
      f?.founder?.slots ?? []
    );

    if (
      g.slot &&
      intro &&
      intro.status === "connected"
    ) {
      intro.slot = g.slot;
      intro.status = "scheduled";
      this.store.save();

      await this.say(
        chat.id,
        say.locked(intro.id, g.slot)
      );

      this.later(
        this.opts.followupDelayMs,
        () => this.followUp(intro)
      );
      return;
    }

    if (g.action === "react" && e.messageId) {
      await this.t.react(
        chat.id,
        e.messageId,
        "love"
      );

      const m = chat.messages.find(
        (x) => x.id === e.messageId
      );

      if (m) {
        m.reaction = "love";
        this.store.save();
        this.store.emit("change", {
          type: "reaction",
          chatId: chat.id,
        });
      }
      return;
    }

    if (g.action === "respond") {
      const ctx =
        intro && f
          ? {
              offeredTimes: f.founder?.slots,
              company: f.founder?.company,
              role: f.founder?.roleTitle,
              status: intro.status,
            }
          : {};

      await this.say(
        chat.id,
        await this.brain.groupReply(
          [
            ...history,
            {
              who: this.nameOf(e.from),
              text: e.text,
            },
          ],
          ctx
        )
      );
    }
  }

  private async followUp(intro: Intro): Promise<void> {
    const c = this.store.person(intro.candidateId)!;
    const f = this.store.person(intro.founderId)!;

    if (intro.status === "followed_up") return;

    intro.status = "followed_up";
    intro.awaiting = [c.id, f.id];
    this.store.save();

    await this.dm(c, say.howDidItGo(f.first));
    await this.dm(
      f,
      say.howDidItGoFounder(c.first)
    );
  }

  private async onAwaitedAnswer(
    p: Person,
    intro: Intro,
    text: string
  ): Promise<void> {
    intro.feedback[p.id] = text;
    intro.awaiting = intro.awaiting!.filter(
      (id) => id !== p.id
    );
    this.store.save();

    if (intro.status === "declined_candidate") {
      await this.dm(p, say.reasonNoted);

      if (intro.initiatedBy !== "founder")
        this.later(
          this.opts.matchDelayMs,
          () => this.proposeNext(p)
        );
      return;
    }

    const good =
      /\b(great|good|well|amazing|loved|next step|moving forward|offer|continue|solid)\b/i.test(
        text
      ) && !/\bnot\b/i.test(text);

    await this.dm(
      p,
      good
        ? say.feedbackGood(`${p.id}:${intro.id}`)
        : say.feedbackMeh(`${p.id}:${intro.id}`)
    );

    if (!intro.awaiting.length)
      this.store.addLog(
        "decision",
        `feedback complete for ${intro.id}`
      );
  }

  private async smallTalk(p: Person): Promise<void> {
    const chat = this.store.dmChatFor(p.handle);

    const history = (chat?.messages ?? []).map(
      (m) => ({
        who: this.nameOf(m.from),
        text: m.text,
      })
    );

    const open = this.store.intros.filter(
      (i) =>
        i.candidateId === p.id ||
        i.founderId === p.id
    );

    const base =
      p.role === "founder"
        ? say.statusFounder
        : open.length
          ? say.statusOpen
          : say.statusNone;

    const feel = say.feel(
      `${p.id}:${history.length}`,
      history.at(-1)?.text ?? ""
    );

    const status = feel
      ? `${feel} ${base}`
      : base;

    await this.dm(
      p,
      await this.brain.chat(p, history, status)
    );
  }

  private schedulePersona(
    p: Person,
    chatId: string,
    lastText: string
  ): void {
    this.later(
      this.opts.personaDelayMs ?? 3000,
      async () => {
        const move = personaMove(
          p,
          this.store.intros,
          (id) => this.store.person(id),
          lastText
        );

        if (move.kind === "none") return;

        await this.handle({
          chatId,
          isGroup: false,
          from: p.handle,
          text: move.text,
          messageId: randomUUID(),
        });
      }
    );
  }

  private nameOf(handle: string): string {
    if (handle === this.t.agentHandle)
      return "WarehouseJobz AI";

    return (
      this.store.byHandle(handle)?.first ||
      handle
    );
  }

  private record(
    chatId: string,
    text: string,
    messageId?: string
  ): void {
    this.store.pushMessage(chatId, {
      id: messageId ?? randomUUID(),
      from: this.t.agentHandle,
      text,
      at: new Date().toISOString(),
    });

    this.store.addLog(
      "outbound",
      `WarehouseJobz AI: ${text}`
    );
  }

  async dm(
    p: Person,
    ...texts: string[]
  ): Promise<void> {
    if (p.optedOut) return;

    const lines = texts.filter(Boolean);
    if (!lines.length) return;

    let chatId = "";

    for (const text of lines) {
      if (
        this.isPersona(p) &&
        this.t.name !== "sim"
      ) {
        chatId = `persona:${p.handle}`;

        this.store.ensureChat(chatId, {
          handles: [p.handle],
          isGroup: false,
        });

        this.record(chatId, text);
        continue;
      }

      const sent = await this.t.sendDM(
        p.handle,
        text
      );

      chatId = sent.chatId;

      this.store.ensureChat(chatId, {
        handles: [p.handle],
        isGroup: false,
      });

      this.record(
        chatId,
        text,
        sent.messageId
      );
    }

    if (this.isPersona(p))
      this.schedulePersona(
        p,
        chatId,
        lines.at(-1)!
      );
  }

  async say(
    chatId: string,
    ...texts: string[]
  ): Promise<void> {
    for (const text of texts.filter(Boolean)) {
      const { messageId } =
        await this.t.sendToChat(chatId, text);

      this.record(chatId, text, messageId);
    }
  }
}

export function roleCard(
  fp: FounderProfile
): string {
  const job = fp as WarehouseEmployer;
  const pay =
    job.hourlyPayMin !== undefined &&
    job.hourlyPayMax !== undefined
      ? job.hourlyPayMin === job.hourlyPayMax
        ? `$${job.hourlyPayMin}/hr`
        : `$${job.hourlyPayMin}-$${job.hourlyPayMax}/hr`
      : "Hourly pay to be confirmed";

  const location = [
    job.city,
    job.state,
  ].filter(Boolean).join(", ");

  return [
    "WAREHOUSEJOBZ OPEN POSITION",
    `Company: ${job.company}`,
    `Position: ${job.roleTitle}`,
    `Pay: ${pay}`,
    location ? `Location: ${location}` : "",
    job.shift ? `Shift: ${job.shift}` : "",
    job.employmentType
      ? `Employment: ${job.employmentType}`
      : "",
    job.workersNeeded !== undefined
      ? `Workers needed: ${job.workersNeeded}`
      : "",
    job.startDate
      ? `Start date: ${job.startDate}`
      : "",
    job.mustHaves.length
      ? `Required skills: ${job.mustHaves.slice(0, 8).join(", ")}`
      : "",
    job.success
      ? `Expectations: ${job.success}`
      : "",
    job.pitch
      ? `Details: ${job.pitch}`
      : "",
    "Next step: Confirm interest to request an employer introduction.",
  ].filter(Boolean).join("\n");
}

export const warehouseJobCard = roleCard;