/**
 * The voice interview.
 *
 * These exist to capture the things a model cannot infer from a topic: who you
 * are talking to, what you refuse to say, the phrases you actually use, and
 * what you believe that your competitors do not. Generic "describe your brand
 * voice" questions produce generic answers, so every question here asks for a
 * specific example or a specific refusal instead.
 *
 * Designed to be answered OUT LOUD in under a minute each. Spoken answers
 * carry rhythm and word choice that typed answers flatten, which is most of
 * what a voice profile is for.
 */

export interface VoiceQuestion {
  key: string;
  section: string;
  question: string;
  /** Shown under the question. Nudges toward a usable answer, not an essay. */
  hint: string;
}

export const VOICE_SECTIONS = [
  "Who you're talking to",
  "How you actually talk",
  "What you believe",
  "Proof you've earned",
  "Lines you won't cross",
] as const;

export const VOICE_QUESTIONS: VoiceQuestion[] = [
  // --- Who you're talking to -------------------------------------------
  {
    key: "audience_one_person",
    section: "Who you're talking to",
    question: "Picture one real person you want to reach. Who are they?",
    hint: "An actual client or someone like them. Age, job, where they are in life, what they just googled at 11pm.",
  },
  {
    key: "audience_fear",
    section: "Who you're talking to",
    question: "What are they quietly afraid of that they would not say out loud?",
    hint: "Not the question they ask you. The one underneath it.",
  },
  {
    key: "audience_wrong_belief",
    section: "Who you're talking to",
    question: "What do they believe about mortgages or buying that is just wrong?",
    hint: "The myth you find yourself correcting over and over.",
  },
  {
    key: "audience_language",
    section: "Who you're talking to",
    question: "How do they describe their situation in their own words?",
    hint: "Their phrasing, not industry phrasing. What do they call a down payment, a pre-approval, their credit?",
  },
  {
    key: "audience_not_for",
    section: "Who you're talking to",
    question: "Who are you deliberately NOT for?",
    hint: "The client you would refer elsewhere. Saying this sharpens everything else.",
  },

  // --- How you actually talk -------------------------------------------
  {
    key: "voice_explain_simply",
    section: "How you actually talk",
    question: "Explain what a debt-to-income ratio is, the way you'd say it to a friend at a barbecue.",
    hint: "Say it out loud, exactly as you would in person. This one is pure voice sample.",
  },
  {
    key: "voice_favourite_phrases",
    section: "How you actually talk",
    question: "What phrases do you catch yourself using all the time?",
    hint: "Your verbal tics. The things a friend would recognise as yours.",
  },
  {
    key: "voice_humour",
    section: "How you actually talk",
    question: "Are you funny, and if so, what kind of funny?",
    hint: "Dry, goofy, self-deprecating, deadpan? Or straight down the line? Both are fine, but pick.",
  },
  {
    key: "voice_formality",
    section: "How you actually talk",
    question: "How formal are you with someone you've just met?",
    hint: "Would you say 'Hey' or 'Good afternoon'? Do you swear? Do you use their first name immediately?",
  },
  {
    key: "voice_open_and_close",
    section: "How you actually talk",
    question: "How do you usually start a video, and how do you end one?",
    hint: "Your actual habits, even if you think they're boring. Especially the call to action.",
  },
  {
    key: "voice_long_or_short",
    section: "How you actually talk",
    question: "Do you talk in short punchy sentences or longer winding ones?",
    hint: "Answer out loud and the answer records itself. Say it however it comes.",
  },

  // --- What you believe -------------------------------------------------
  {
    key: "belief_hot_take",
    section: "What you believe",
    question: "What do you believe about lending that most loan officers would argue with?",
    hint: "A real opinion with an edge. Agreeable content is invisible content.",
  },
  {
    key: "belief_industry_wrong",
    section: "What you believe",
    question: "What does the mortgage industry do that you think is bad for clients?",
    hint: "Be specific. Name the practice, not the vibe.",
  },
  {
    key: "belief_advice_ignored",
    section: "What you believe",
    question: "What advice do you give that people usually ignore, and shouldn't?",
    hint: "The thing you repeat because it keeps mattering.",
  },
  {
    key: "belief_why_this_job",
    section: "What you believe",
    question: "Why do you do this job? Not the marketing answer.",
    hint: "If the honest answer is money and freedom, say money and freedom.",
  },
  {
    key: "belief_what_good_looks_like",
    section: "What you believe",
    question: "What does a great outcome look like for a client of yours?",
    hint: "Beyond 'they closed'. What is actually different for them afterwards?",
  },

  // --- Proof you've earned ---------------------------------------------
  {
    key: "proof_best_story",
    section: "Proof you've earned",
    question: "Tell the story of a client you're proudest of helping.",
    hint: "Start where they were stuck. No names if you'd rather not.",
  },
  {
    key: "proof_hardest_deal",
    section: "Proof you've earned",
    question: "What's the hardest deal you've got over the line, and how?",
    hint: "The one that should have fallen apart.",
  },
  {
    key: "proof_credentials",
    section: "Proof you've earned",
    question: "What should people know about your background and licensing?",
    hint: "NMLS number, which states, how long, anything that earns trust in one line.",
  },
  {
    key: "proof_specialty",
    section: "Proof you've earned",
    question: "What loan types or situations are you genuinely best at?",
    hint: "Where you'd back yourself against anyone local.",
  },
  {
    key: "proof_mistake",
    section: "Proof you've earned",
    question: "What have you got wrong, and what did it teach you?",
    hint: "This one earns more trust than any win. Worth answering honestly.",
  },

  // --- Lines you won't cross -------------------------------------------
  {
    key: "limit_never_say",
    section: "Lines you won't cross",
    question: "What words or phrases should never appear in anything written for you?",
    hint: "Jargon you hate, hype words, anything that makes you cringe. Be ruthless.",
  },
  {
    key: "limit_claims",
    section: "Lines you won't cross",
    question: "What claims must never be made on your behalf?",
    hint: "Rates, approvals, guarantees. You're licensed, so this one is compliance as well as taste.",
  },
  {
    key: "limit_tone_wrong",
    section: "Lines you won't cross",
    question: "Describe a post in your industry that made you cringe. What was wrong with it?",
    hint: "Naming what you hate defines your voice faster than naming what you like.",
  },
  {
    key: "limit_personal",
    section: "Lines you won't cross",
    question: "How much of your personal life belongs in your content?",
    hint: "Family, faith, politics, hobbies. Where's the line for you?",
  },
];

export function getQuestion(key: string): VoiceQuestion | undefined {
  return VOICE_QUESTIONS.find((q) => q.key === key);
}

export const TOTAL_QUESTIONS = VOICE_QUESTIONS.length;
