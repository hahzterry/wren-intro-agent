
/**
 * WAREHOUSEJOBZ AI
 * Voice, Messaging & Recruiting Conversation Templates
 *
 * A friendly AI warehouse recruiting assistant.
 *
 * Connects warehouse workers with employers through
 * SMS and iMessage using double opt-in introductions.
 *
 * Rules:
 * - Short, conversational messages.
 * - Friendly and professional.
 * - Ask one question at a time.
 * - Never invent jobs, pay, shifts or qualifications.
 * - Never guarantee a job, interview or start date.
 * - Never share private contact details before consent.
 * - Never pretend to be human.
 * - Respect opt-outs.
 *
 * Compatibility:
 * Preserves original Wren voice API.
 *
 * Important fixed phrases:
 * "proudest"
 * "leave"
 * "Want an intro?"
 * "Want the intro?"
 * "Anything you'd change?"
 * "Stepping out"
 * "How did it go with"
 * "pass this time"
 */

/**
 * Deterministic message selection.
 * The same key consistently selects the same message.
 */
export function pick<T>(
  options: readonly T[],
  key: string
): T {
  if (options.length === 0) {
    throw new Error("pick() requires at least one option");
  }

  let h = 2166136261;

  for (let i = 0; i < key.length; i++) {
    h = Math.imul(
      h ^ key.charCodeAt(i),
      16777619
    );
  }

  return options[(h >>> 0) % options.length];
}

const fill = (
  template: string,
  values: Record<string, string>
): string =>
  template.replace(
    /\{(\w+)\}/g,
    (_, key: string) => values[key] ?? ""
  );

export const say = {
  // ==========================================
  // FIRST CONTACT
  // ==========================================

  helloVouched: (
    key: string,
    v: {
      first: string;
      voucher: string;
      quote: string;
    }
  ) =>
    fill(
      pick(
        [
          "Hi {first}, I'm WarehouseJobz AI. {voucher} referred you and mentioned your warehouse experience: {quote}. Are you open to hearing about jobs?",
          "Hey {first}! WarehouseJobz AI here. {voucher} recommended you and said {quote}. I'd love to learn what warehouse work you're looking for.",
          "Hi {first}, this is WarehouseJobz AI. {voucher} pointed me your way. They mentioned {quote}. Is now a good time to talk about warehouse opportunities?",
        ],
        key
      ),
      v
    ),

  whoAmI: (key: string) =>
    pick(
      [
        "I'm WarehouseJobz AI, a virtual recruiting assistant that connects warehouse workers with employers. I only introduce people when both sides agree.",
        "I'm an AI hiring assistant for warehouse jobs. I help workers find suitable openings and help employers connect with interested candidates.",
        "I'm WarehouseJobz AI. Think of me as your warehouse job matching assistant. I check experience, pay, location and shifts before suggesting an introduction.",
      ],
      key
    ),

  helloStranger: (key: string) =>
    pick(
      [
        "Hi! I'm WarehouseJobz AI, your warehouse job matching assistant. What should I call you?",
        "Hey! WarehouseJobz AI here. I help warehouse workers and employers connect. What's your name?",
      ],
      key
    ),

  askVoucher: (key: string, first: string) =>
    fill(
      pick(
        [
          "Thanks, {first}. Did someone refer you to WarehouseJobz, or did you find us online?",
          "Nice, {first}. Quick question: who referred you, if anyone? It's fine if you found us yourself.",
        ],
        key
      ),
      { first }
    ),

  askNameAgain: (key: string) =>
    pick(
      [
        "What name should I use for you?",
        "Before we get started, what's your first name?",
      ],
      key
    ),

  askSideAgain:
    "Are you looking for a warehouse job, or hiring workers for a warehouse?",

  askVoucherAgain:
    "Did someone refer you? You can share their name or reply 'nobody' if you found WarehouseJobz yourself.",

  noVoucher:
    "No problem. You don't need a referral to use WarehouseJobz. I'll ask a few questions to help find the right match.",

  thanksVoucher: (
    key: string,
    v: {
      first: string;
      voucher: string;
    }
  ) =>
    fill(
      pick(
        [
          "Thanks, {first}. I'll note that {voucher} referred you.",
          "Got it, {first}. Thanks for sharing {voucher}'s name.",
        ],
        key
      ),
      v
    ),

  // ==========================================
  // WORKER OR EMPLOYER
  // ==========================================

  askSide: (key: string, first: string) =>
    fill(
      pick(
        [
          "Nice to meet you, {first}. Are you looking for warehouse work or hiring warehouse workers?",
          "Great to meet you, {first}! Are you here to find a warehouse job or fill warehouse positions?",
        ],
        key
      ),
      { first }
    ),

  // ==========================================
  // WORKER INTAKE
  // ==========================================

  interviewIntro: (n: number) => {
    const words = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
    ];

    const count = words[n] ?? String(n);

    return `${count} quick questions about your warehouse experience, pay and availability.`;
  },

  resumeAsk: (key: string) =>
    pick(
      [
        "Have a resume? Paste it here and I'll check your warehouse experience. If not, reply 'skip' and we'll go through it together.",
        "If you have a resume or work history, send it over. I'll use it to understand your warehouse skills. No resume? Just say 'skip'.",
      ],
      key
    ),

  resumeRead: (key: string) =>
    pick(
      [
        "Got your work history. Thanks! I have a few questions about the warehouse jobs you'd prefer.",
        "Thanks, I've reviewed what you shared. Let's talk about your experience and availability.",
      ],
      key
    ),

  resumeSkipped: (key: string) =>
    pick(
      [
        "No problem. You can still look for warehouse jobs without a resume.",
        "That's fine. I'll ask about your work experience directly.",
      ],
      key
    ),

  // ==========================================
  // EMPLOYER INTAKE
  // ==========================================

  askCompany: (
    key: string,
    first: string
  ) =>
    fill(
      pick(
        [
          "Great, {first}. I can help connect you with interested warehouse workers. What's your company name?",
          "Thanks, {first}. Let's get your warehouse opening set up. What company are you hiring for?",
        ],
        key
      ),
      { first }
    ),

  askJD: (
    key: string,
    company: string
  ) =>
    fill(
      pick(
        [
          "What warehouse positions is {company} hiring for? You can paste a job description or just tell me the title, pay and shift.",
          "Send me the job description for {company}, or describe the warehouse role in a few sentences. I'll help organize the details.",
        ],
        key
      ),
      { company }
    ),

  jdRead: (
    key: string,
    role: string
  ) =>
    fill(
      pick(
        [
          "Got it, you're hiring for {role}. I have a few questions to make sure workers understand the job.",
          "Thanks. I've reviewed the {role} opening. Let's confirm the qualifications and schedule.",
        ],
        key
      ),
      { role }
    ),

  ackRole: (key: string) =>
    pick(
      [
        "Got it. That helps narrow down the right workers.",
        "Thanks, that's useful for matching.",
        "Understood. I'll keep that requirement in mind.",
        "Good detail. That helps clarify the position.",
      ],
      key
    ),

  roleCardIntro: (key: string) =>
    pick(
      [
        "Here's the warehouse job summary I'd share with interested workers. Please check the details before I send it:",
        "I've drafted the warehouse opening. Review the pay, shift, location and requirements before we share it:",
      ],
      key
    ),

  roleReady: (key: string) =>
    pick(
      [
        "Your warehouse opening is ready for matching. I'll check for workers whose experience and preferences fit.",
        "Great. I'll look for suitable warehouse workers and ask for their permission before making introductions.",
      ],
      key
    ),

  foundCandidate: (key: string) =>
    pick(
      [
        "I found a worker who may fit your warehouse opening. Here's their relevant experience before I ask about an introduction:",
        "There's a potential match for your position. I'll share the job-related qualifications first:",
      ],
      key
    ),

  askReachOut:
    "Want me to check whether they're interested in your warehouse opening? I'll only share their identity after they agree.",

  checkingCandidate: (key: string) =>
    pick(
      [
        "I'll check whether the worker is interested. I'll only make an introduction if they agree.",
        "Got it. I'll ask the worker privately before connecting you.",
      ],
      key
    ),

  candidatePassToFounder: (
    key: string,
    _first?: string
  ) =>
    pick(
      [
        "The worker is going to pass this time. I'll continue checking for other suitable candidates.",
        "They aren't interested in this opening right now. I'll keep looking for another match.",
      ],
      key
    ),

  noCandidate: (key: string) =>
    pick(
      [
        "I haven't found a suitable worker for this opening yet. I'll keep checking.",
        "No qualified match is available in the current results. I'll continue the search.",
      ],
      key
    ),

  // ==========================================
  // EMOTIONAL ACKNOWLEDGMENT
  // ==========================================

  feel: (
    key: string,
    text: string
  ): string | undefined => {
    if (
      /\b(laid off|let go|layoffs?|fired|lost my job)\b/i.test(
        text
      )
    ) {
      return pick(
        [
          "I'm sorry to hear that. Let's focus on finding a warehouse job that fits what you need next.",
          "That's a tough situation. Thanks for sharing it with me. I'll keep your priorities in mind.",
        ],
        key
      );
    }

    if (
      /\b(burn(?:ed|t)? ?out|exhausted|drained|overwhelmed|stressed|anxious|nervous|scared)\b/i.test(
        text
      )
    ) {
      return pick(
        [
          "That sounds stressful. I'll keep your schedule and work preferences in mind.",
          "Thanks for being open about that. We'll focus on jobs that better fit your needs.",
        ],
        key
      );
    }

    if (
      /\b(packed|swamped|slammed|back to back|busy|crazy week)\b/i.test(
        text
      )
    ) {
      return pick(
        [
          "Got it. I'll keep this quick.",
          "No problem. You can reply whenever you have time.",
        ],
        key
      );
    }

    if (
      /\b(excited|thrilled|can't wait|love it|love this|so proud|pumped)\b/i.test(
        text
      )
    ) {
      return pick(
        [
          "Glad to hear you're excited about it!",
          "Love the enthusiasm. Let's find a good fit.",
        ],
        key
      );
    }

    return undefined;
  },

  ack: (key: string) =>
    pick(
      [
        "Got it, thanks.",
        "Good to know.",
        "That helps.",
        "Thanks for sharing.",
      ],
      key
    ),

  ackReason: (key: string) =>
    pick(
      [
        "That makes sense. I'll keep it in mind.",
        "Got it. That helps me understand what you're looking for.",
        "Thanks. I'll factor that into future matches.",
      ],
      key
    ),

  ackResult: (key: string) =>
    pick(
      [
        "That's useful warehouse experience.",
        "Good example. That helps show what you've done on the job.",
        "That gives me a clearer picture of your skills.",
      ],
      key
    ),

  // ==========================================
  // WORKER PROFILE APPROVAL
  // ==========================================

  blurbIntro: (key: string) =>
    pick(
      [
        "Here's the warehouse worker profile I'd share with interested employers. Please review it first:",
        "I've put together a short summary of your warehouse experience. Nothing gets shared without your approval:",
      ],
      key
    ),

  blurbAsk:
    "Anything you'd change?",

  blurbHidden:
    "Got it. I'll keep your pay expectations private unless you approve sharing them.",

  blurbUpdated:
    "Updated:",

  blurbConfirm:
    "Does everything look correct?",

  ready: (key: string) =>
    pick(
      [
        "Your WarehouseJobz profile is ready. I'll check for jobs that match your experience, pay and preferred shifts.",
        "You're set! I'll look for warehouse openings that fit your work preferences.",
        "All set. I'll reach out when there's a relevant warehouse opportunity to review.",
      ],
      key
    ),

  // ==========================================
  // JOB MATCHING
  // ==========================================

  proposeOpener: (
    key: string,
    employerName: string
  ) =>
    fill(
      pick(
        [
          "I found a warehouse opportunity with {f} that may fit your experience.",
          "There's a warehouse opening with {f} you might be interested in.",
          "I think this warehouse position with {f} could be worth a look.",
        ],
        key
      ),
      { f: employerName }
    ),

  askIntro:
    "Want an intro?",

  checkingFounder: (
    key: string,
    first: string
  ) =>
    fill(
      pick(
        [
          "Great. I'll check with {f} before connecting you. Both sides need to agree first.",
          "Thanks. I'll ask {f} whether they'd like an introduction.",
        ],
        key
      ),
      { f: first }
    ),

  founderPitchOpener: (
    key: string,
    v: {
      first: string;
      role: string;
    }
  ) =>
    fill(
      pick(
        [
          "Hi {first}, WarehouseJobz AI here. I found a worker who may fit your {role} opening.",
          "Hey {first}, I have a potential candidate for your {role} position.",
        ],
        key
      ),
      v
    ),

  founderAsk: (
    key: string,
    candFirst: string
  ) =>
    fill(
      pick(
        [
          "{c} is interested in the position and agreed to connect. Want the intro? I can start a group text.",
          "{c} has agreed to an introduction. Want the intro? I'll connect you both in a group message.",
        ],
        key
      ),
      { c: candFirst }
    ),

  founderIn: (
    key: string,
    first: string
  ) =>
    fill(
      pick(
        [
          "{f} agreed to connect. Starting the introduction now.",
          "{f} said yes. I'll set up the group conversation.",
        ],
        key
      ),
      { f: first }
    ),

  noMatch: (key: string) =>
    pick(
      [
        "I haven't found a warehouse job that matches your current requirements yet.",
        "Still checking for positions that fit your experience, pay and preferred shifts.",
      ],
      key
    ),

  candidatePass: (key: string) =>
    pick(
      [
        "No problem. Was it the pay, shift, location or something else?",
        "That's fine. What didn't fit? Your feedback can help improve future matches.",
      ],
      key
    ),

  candidatePassNoted: (key: string) =>
    pick(
      [
        "Got it. I'll keep that in mind for future warehouse jobs.",
        "Thanks. I'll use that to improve the next match.",
      ],
      key
    ),

  founderPassToFounder: (key: string) =>
    pick(
      [
        "Understood. Thanks for reviewing the candidate.",
        "Got it. I'll continue checking for other suitable workers.",
      ],
      key
    ),

  founderPassToCandidate: (
    key: string,
    first: string
  ) =>
    fill(
      pick(
        [
          "{f} is going to pass this time. I'll continue looking for warehouse jobs that fit your preferences.",
          "{f} won't move forward with this introduction. I'll keep checking for other opportunities.",
        ],
        key
      ),
      { f: first }
    ),

  nudge: (
    first: string,
    founder: boolean
  ) =>
    founder
      ? `Would you like an introduction to ${first} for your warehouse opening? Yes or no is fine.`
      : `Would you like me to connect you with ${first} about the warehouse job? Yes or no is fine.`,

  // ==========================================
  // GROUP INTRODUCTIONS
  // ==========================================

  settingUp:
    "setting up your chat...",

  locked: (
    key: string,
    slot: string
  ) =>
    fill(
      pick(
        [
          "Interview time noted: {slot}. Please confirm the final details with each other. Stepping out now.",
          "You both selected {slot}. Please confirm the location or call details directly. Stepping out now.",
        ],
        key
      ),
      { slot }
    ),

  groupHelp:
    "I can help with interview logistics. Please confirm the time and whether the meeting is by phone, video or at the warehouse.",

  demoIntroNote: (
    key: string,
    first: string
  ) =>
    fill(
      pick(
        [
          "{f} agreed to connect. This is a simulated employer, so here's how the introduction would look:",
          "{f} said yes. Since this is a demo employer, no real hiring conversation will be started. Here's the example introduction:",
        ],
        key
      ),
      { f: first }
    ),

  // ==========================================
  // INTERVIEW FOLLOW-UP
  // ==========================================

  howDidItGo: (
    first: string
  ) =>
    `How did it go with ${first}?`,

  howDidItGoFounder: (
    first: string
  ) =>
    `How did it go with ${first}? Your feedback helps improve future worker matches. It won't be shared without your permission.`,

  feedbackGood: (key: string) =>
    pick(
      [
        "Glad the conversation went well! Let me know if you need help coordinating the next step.",
        "Great to hear. I can help keep the interview and hiring process organized.",
      ],
      key
    ),

  feedbackMeh: (key: string) =>
    pick(
      [
        "Thanks for the feedback. I'll keep it in mind for future matches.",
        "Understood. That helps clarify what to look for next time.",
      ],
      key
    ),

  reasonNoted:
    "Thanks, noted. I'll factor that into future matches.",

  // ==========================================
  // STATUS MESSAGES
  // ==========================================

  statusFounder:
    "Your warehouse opening is being matched against available worker profiles. I'll let you know when there's a suitable candidate to review.",

  statusOpen:
    "Your WarehouseJobz profile is active. I'll check for relevant warehouse openings.",

  statusNone:
    "No suitable warehouse matches are available in the current results. I'll keep checking.",
};

/**
 * WAREHOUSEJOBZ AI
 * Claude personality and communication guide.
 */

export const VOICE_GUIDE = `
You are WarehouseJobz AI, a friendly and efficient
AI warehouse recruiting assistant.

Your job is to help warehouse workers and employers
connect through conversational text messages.

PERSONALITY:
- Friendly, confident and professional.
- Helpful without being pushy.
- Direct and easy to understand.
- Conversational, not robotic.
- Never pretend to be human.
- Identify yourself as an AI assistant when appropriate.
- Never invent job openings or qualifications.

MESSAGE STYLE:
- One to three short sentences.
- Ask one question at a time when possible.
- Avoid corporate jargon.
- Use the person's first name naturally.
- Keep emojis rare.
- No unnecessary formatting.

WORKER SCREENING:
- Ask about warehouse work history.
- Ask about equipment experience.
- Ask about preferred warehouse jobs.
- Ask about first, second, third and weekend shifts.
- Ask about desired hourly pay.
- Ask about work location and availability.
- Ask about required training when relevant.
- Distinguish self-reported skills from verified credentials.

EMPLOYER SCREENING:
- Confirm the warehouse position.
- Confirm hourly pay.
- Confirm warehouse location.
- Confirm shift schedule.
- Confirm required qualifications.
- Confirm number of workers needed.
- Confirm expected start date.
- Identify mandatory versus preferred skills.

MATCHING:
- Match workers using job-related qualifications.
- Consider hourly pay, shift and location compatibility.
- Never guarantee a job offer.
- Never invent employer approval.
- Never claim a credential is verified without evidence.
- Explain uncertainty rather than making assumptions.

INTRODUCTIONS:
- Require consent from both parties.
- Do not share contact details before consent.
- Keep compensation preferences private.
- Explain the position and next steps clearly.
- Let employers make hiring decisions.

EMOTIONAL INTELLIGENCE:
- Job searches can be stressful.
- Acknowledge layoffs or financial pressure briefly.
- Respect workers who decline an opening.
- Do not pressure people to accept jobs.
- Respect employer hiring constraints.
- Be patient when someone is uncertain.

INTERVIEWS:
- Read the resume or work history first.
- Ask about real warehouse tasks.
- Prefer examples over vague personality questions.
- Ask about equipment and shift experience.
- Confirm practical requirements.
- Never fabricate an interview booking.
- Never confuse an interview with a confirmed work shift.

FAIR HIRING:
- Use only job-related information.
- Do not rank by protected characteristics.
- Avoid discriminatory screening.
- Do not make final hiring decisions.
- Respect SMS opt-outs and messaging consent.

Your goal is to make warehouse hiring simpler,
faster and more transparent for workers and employers.
`;
