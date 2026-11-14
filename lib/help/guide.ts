/**
 * What every page is for, in plain words.
 *
 * Kept as data rather than written into the page, for one reason: a help
 * page that lists features goes stale the week after it is written, and
 * a wrong help page is worse than none because it sends him looking for
 * something that is not there. Holding it as data lets
 * scripts/check-help.mjs assert that every item in the menu has an entry
 * here and that every entry points at a real page, so adding a page
 * without explaining it fails rather than passing quietly.
 */

export interface HelpEntry {
  href: string;
  /** One line. What it does, not what it is. */
  what: string;
  /** When he would actually open it. Left out when it is obvious. */
  when?: string;
}

export const HELP: HelpEntry[] = [
  {
    href: "/dashboard",
    what: "Where you are: what went out, what did well, what is waiting.",
    when: "First thing, to see where the week stands.",
  },
  {
    href: "/voice",
    what: "Answer some questions out loud once, and everything the app writes from then on sounds like you.",
    when: "Do this before anything else. It is the thing that makes the rest worth using.",
  },
  {
    href: "/talk",
    what: "Say a whole thought out loud and get a reel, a carousel, an email, whatever you tick, written from your actual words.",
    when: "When you have a thought and no time to type it.",
  },
  {
    href: "/books",
    what: "Write a book. Say what it argues, get an outline, write chapters one at a time from your own material.",
  },
  {
    href: "/clips",
    what: "Load a long video and it tells you which parts stand on their own, then cuts them for you.",
    when: "After you have filmed one long take instead of five short ones.",
  },
  {
    href: "/news",
    what: "React to something that happened. Any number from the article is quoted as that source's, never as yours.",
  },
  {
    href: "/ideas",
    what: "Everything you have thought of, and which formats each one has been turned into.",
    when: "When you do not know what to post.",
  },
  {
    href: "/this-week",
    what: "The week laid out: what is scheduled, what is written, what still needs filming.",
  },
  {
    href: "/autopsy",
    what: "Takes a post that did badly and tells you what went wrong with it.",
  },
  {
    href: "/patterns",
    what: "Reads all your posts together and tells you what your good ones have in common.",
    when: "Monthly. It needs a pile of posts to say anything useful.",
  },
  {
    href: "/scripts",
    what: "Writes a reel script you can read straight off the teleprompter.",
  },
  {
    href: "/hooks",
    what: "First lines. The part people decide on in a second and a half.",
  },
  {
    href: "/game-plan",
    what: "What you are trying to do this quarter, so everything else has something to aim at.",
  },
  { href: "/newsletter", what: "Emails to your list." },
  {
    href: "/photos",
    what: "Your own photos, sorted, so a carousel is not stock images.",
  },
  {
    href: "/session-prep",
    what: "Lines up everything you are going to film in one sitting.",
    when: "The night before a filming session.",
  },
  {
    href: "/session-mode",
    what: "The teleprompter. Your words on screen, camera on, tap for the next line.",
    when: "While you are actually filming.",
  },
  {
    href: "/boards",
    what: "Accounts and posts you have saved to look at later, grouped.",
  },
  {
    href: "/inspiration",
    what: "Paste someone else's post and it pulls apart why it worked.",
  },
  {
    href: "/leads",
    what: "Everyone you have already looked at, in one list, with where you are with each of them.",
    when: "When you are ready to reach out rather than post.",
  },
  { href: "/history", what: "Everything you have ever posted." },
  {
    href: "/health",
    what: "Says whether the database is set up properly and what is missing if it is not.",
    when: "When a page says something is not set up.",
  },
  {
    href: "/settings",
    what: "Your verified facts and where they came from. Nothing the app writes will state a number that is not in here.",
    when: "Whenever you learn a figure you will want to use in a post.",
  },
];

/**
 * The loop. Four steps, in the order they happen.
 *
 * Deliberately short. A weekly routine with eleven steps is one nobody
 * follows, and the point of writing it down is that he can hold it in
 * his head.
 */
export const WEEKLY_LOOP: { title: string; detail: string; href?: string }[] = [
  {
    title: "Catch the thoughts",
    detail:
      "Talk it out, or drop a line into Ideas. Do not wait until you know what to do with it.",
    href: "/talk",
  },
  {
    title: "Turn them into things",
    detail:
      "Open Ideas and tick the formats you want. The writing happens from what you said, not from the title.",
    href: "/ideas",
  },
  {
    title: "Film in one sitting",
    detail:
      "Session Prep lines them up, Session Mode is the teleprompter. One sitting beats five.",
    href: "/session-prep",
  },
  {
    title: "Cut and post",
    detail:
      "The edit room cuts the silence out. Clip finder pulls the standalone bits out of a long take.",
    href: "/clips",
  },
];

/** What actually goes wrong, and the one thing to do about it. */
export const WHEN_IT_BREAKS: { problem: string; answer: string }[] = [
  {
    problem: "A page says something is not set up",
    answer:
      "A database change has not been run. Open Database check, it names the file. Run that SQL in Supabase.",
  },
  {
    problem: "The microphone does nothing",
    answer:
      "The browser blocked it. On a phone, Safari and Chrome both ask once and remember the answer. Check the site settings for the address.",
  },
  {
    problem: "Nothing happens when you press a write button",
    answer:
      "Usually a missing API key. Those live in Vercel under Environment Variables, not in the app.",
  },
  {
    problem: "A video saves sideways or choppy",
    answer:
      "Film in the app rather than importing, and keep the screen awake while it saves. Tell Claude the length and what you saw.",
  },
  {
    problem: "You want a number in a post and it refuses",
    answer:
      "That is deliberate. Add it to Sources and Facts with where it came from, and it will use it.",
  },
];
