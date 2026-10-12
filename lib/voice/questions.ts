/**
 * The voice interview.
 *
 * These exist to capture what a model cannot infer from a topic: who you are
 * talking to, what you refuse to say, the phrases you actually use, and what
 * you believe that your competitors do not.
 *
 * Written to work for any entrepreneur -- an agent, a coach, a lender, a
 * contractor, someone selling a product -- because the people answering this
 * are not all in the same business. So no question names an industry, a job
 * title or a piece of jargon. Each one asks for a specific example or a
 * specific refusal instead, because "describe your brand voice" reliably
 * produces answers too generic to be worth storing.
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
    question: "Picture one real customer you'd love more of. Who are they?",
    hint: "An actual person, not a demographic. What's their life like, what are they in the middle of?",
  },
  {
    key: "audience_fear",
    section: "Who you're talking to",
    question: "What are they quietly worried about that they'd never say out loud?",
    hint: "Not the question they ask you. The one underneath it.",
  },
  {
    key: "audience_wrong_belief",
    section: "Who you're talking to",
    question: "What do people believe about what you do that's just wrong?",
    hint: "The misunderstanding you find yourself correcting over and over.",
  },
  {
    key: "audience_language",
    section: "Who you're talking to",
    question: "How do your customers describe their problem in their own words?",
    hint: "Their phrasing, not your industry's. What do they call the thing you sell?",
  },
  {
    key: "audience_not_for",
    section: "Who you're talking to",
    question: "Who are you deliberately NOT for?",
    hint: "The customer you'd turn away or refer elsewhere. Saying this sharpens everything else.",
  },

  // --- How you actually talk -------------------------------------------
  {
    key: "voice_explain_simply",
    section: "How you actually talk",
    question:
      "Explain the thing you most often have to explain, the way you'd say it to a friend at a barbecue.",
    hint: "Say it out loud, exactly as you would in person. This one is pure voice sample, so don't tidy it.",
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
    hint: "Would you say 'Hey' or 'Good afternoon'? Do you swear? First names straight away?",
  },
  {
    key: "voice_open_and_close",
    section: "How you actually talk",
    question: "How do you usually start a video or a post, and how do you end one?",
    hint: "Your real habits, even if you think they're boring. Especially how you ask for the next step.",
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
    question: "What do you believe about your industry that most people in it would argue with?",
    hint: "A real opinion with an edge. Agreeable content is invisible content.",
  },
  {
    key: "belief_industry_wrong",
    section: "What you believe",
    question: "What does your industry do that's bad for the customer?",
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
    question: "Why do you do this for a living? Not the marketing answer.",
    hint: "If the honest answer is money and freedom, say money and freedom.",
  },
  {
    key: "belief_what_good_looks_like",
    section: "What you believe",
    question: "What does a great outcome look like for someone who works with you?",
    hint: "Beyond 'they bought'. What's actually different for them afterwards?",
  },

  // --- Proof you've earned ---------------------------------------------
  {
    key: "proof_best_story",
    section: "Proof you've earned",
    question: "Tell the story of a customer you're proudest of helping.",
    hint: "Start where they were stuck. No names if you'd rather not.",
  },
  {
    key: "proof_hardest_job",
    section: "Proof you've earned",
    question: "What's the hardest job you've got over the line, and how?",
    hint: "The one that should have fallen apart.",
  },
  {
    key: "proof_background",
    section: "Proof you've earned",
    question: "What should people know about your background and credentials?",
    hint: "How long, where, any licences or qualifications. Anything that earns trust in one line.",
  },
  {
    key: "proof_specialty",
    section: "Proof you've earned",
    question: "What are you genuinely best at, better than your competitors?",
    hint: "Where you'd back yourself against anyone local.",
  },
  {
    key: "proof_mistake",
    section: "Proof you've earned",
    question: "What have you got wrong, and what did it teach you?",
    hint: "This earns more trust than any win. Worth answering honestly.",
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
    hint: "Guarantees, numbers, promises about results. If your work is regulated, this is compliance as well as taste.",
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
