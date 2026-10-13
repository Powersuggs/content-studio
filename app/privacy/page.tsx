import Link from "next/link";
import { Bullets, Mail, PolicyPage, Section } from "@/components/PolicyPage";

export const metadata = {
  title: "Privacy policy - Content Studio",
  description:
    "What Content Studio collects, why, who it is shared with, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy policy">
      <p>
        Content Studio is a tool for analysing your own social media posts and
        drafting new ones. This page describes exactly what it stores about
        you, why, and how to get rid of it. It is written to be read, not to be
        skimmed past.
      </p>

      <Section heading="Who runs this">
        <p>
          Content Studio is operated by Aaron Suggs. Questions about anything on
          this page go to <Mail />.
        </p>
      </Section>

      <Section heading="What is collected">
        <p>
          <strong className="text-text">Your account.</strong> Your email
          address and a hashed version of your password. The password itself is
          never stored and cannot be recovered from the hash.
        </p>
        <p>
          <strong className="text-text">Your Instagram data, if you connect
          it.</strong> Connecting is optional and is done through Instagram&apos;s
          own approval screen. Once connected, the app reads:
        </p>
        <Bullets
          items={[
            "your Instagram user ID, username, display name, biography, and follower and media counts",
            "your posts: captions, media URLs, thumbnails, and the date each was published",
            "the metrics Instagram reports for each post -- views, likes, comments, shares, saves, reach, and average watch time",
          ]}
        />
        <p>
          It does not read your direct messages, it does not post on your
          behalf, and it does not read anyone else&apos;s account.
        </p>
        <p>
          <strong className="text-text">What you create here.</strong> Scripts,
          hooks, notes, boards, and the voice profile built from your answers to
          the interview questions -- including the audio you record, if you use
          the microphone, which is transcribed and then discarded as audio.
        </p>
      </Section>

      <Section heading="Why it is collected">
        <p>
          All of it exists to produce the analysis and drafts the app is for.
          Your posts and their metrics are what the pattern analysis reads; your
          voice profile is what the drafting uses so the output sounds like you.
          None of it is used to build advertising profiles, and none of it is
          sold.
        </p>
      </Section>

      <Section heading="Who it is shared with">
        <p>
          Content Studio is not an advertising business and does not sell or
          rent your data. It is shared only with the services needed to run it:
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-text">Supabase</strong> -- hosts the
              database where everything above is stored.
            </>,
            <>
              <strong className="text-text">Vercel</strong> -- hosts and serves
              the application itself.
            </>,
            <>
              <strong className="text-text">Anthropic (Claude)</strong> --
              receives your post captions, metrics, and voice profile when you
              ask for analysis or a draft, in order to generate it.
            </>,
            <>
              <strong className="text-text">Groq</strong> -- receives voice
              recordings you make in the app, to transcribe them to text.
            </>,
            <>
              <strong className="text-text">Meta / Instagram</strong> -- the
              source of the Instagram data, contacted with the token you
              granted.
            </>,
          ]}
        />
        <p>
          Data is also disclosed if the law requires it, which has not happened
          to date.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Your account data and what you create here are kept while your account
          is open. Instagram-derived data is kept until you disconnect
          Instagram or request deletion. Access tokens expire on
          Instagram&apos;s schedule -- currently 60 days -- and are refreshed
          while your connection is active.
        </p>
      </Section>

      <Section heading="Your choices">
        <Bullets
          items={[
            "Disconnecting Instagram, from the app's settings page or from Instagram's own app settings, stops all further collection immediately.",
            <>
              Deleting your Instagram data removes everything derived from it.
              See <Link href="/data-deletion" className="text-accent hover:underline">the deletion page</Link>.
            </>,
            "Closing your account entirely removes everything, including what you wrote here. Email the address above to request it.",
            "Microphone and camera features only run when you start them, and the browser asks your permission first.",
          ]}
        />
      </Section>

      <Section heading="Security">
        <p>
          Accounts are isolated from each other at the database level, so one
          account cannot read another&apos;s rows even if the application code
          has a bug. Passwords are hashed with scrypt. Sessions are signed
          cookies. Access tokens are stored server-side and are never sent to
          the browser.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          Content Studio is a business tool and is not intended for anyone under
          18. Accounts are not knowingly created for minors.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          If this policy changes in a way that affects what is collected or who
          it is shared with, the date at the top changes and account holders are
          notified by email before it takes effect.
        </p>
      </Section>
    </PolicyPage>
  );
}
