import { Bullets, Mail, PolicyPage, Section } from "@/components/PolicyPage";

export const metadata = {
  title: "Delete your data - Content Studio",
  description:
    "Three ways to delete the data Content Studio holds about you, and what each one removes.",
};

export default function DataDeletionPage() {
  return (
    <PolicyPage title="Delete your data">
      <p>
        There are three different things you might want, and they remove
        different amounts. Pick the one you mean.
      </p>

      <Section heading="1. Stop collecting, keep what is there">
        <p>
          Disconnect Instagram. Sign in, open{" "}
          <span className="text-text">Sources &amp; Facts</span>, and press
          Disconnect. Nothing further is collected from that moment. Your
          existing posts and metrics stay, so reconnecting later picks up where
          you left off.
        </p>
        <p>
          You can also do this from Instagram&apos;s side -- in the Instagram
          app, under <span className="text-text">Settings → Website
          permissions → Apps and websites</span>, remove Content Studio. The
          app is told, and the connection is cleared here automatically.
        </p>
      </Section>

      <Section heading="2. Delete your Instagram data">
        <p>This removes everything that came from Instagram:</p>
        <Bullets
          items={[
            "every synced post, caption, and thumbnail reference",
            "all stored metrics -- views, likes, comments, shares, saves, reach, watch time",
            "the AI analysis built from those posts",
            "your Instagram user ID, username, follower and media counts, and the access token",
          ]}
        />
        <p>
          What you wrote yourself is not touched: your scripts, hooks, boards,
          and voice profile did not come from Instagram.
        </p>
        <p>
          <strong className="text-text">Two ways to start it.</strong> From
          Instagram: remove Content Studio in{" "}
          <span className="text-text">Settings → Apps and websites</span> and
          choose the delete option -- Instagram notifies the app, the deletion
          runs, and you are given a confirmation code and a link that shows its
          status. Or email <Mail /> from the address on your account and ask for
          Instagram data deletion; it is done by hand within 30 days, usually
          the same week.
        </p>
      </Section>

      <Section heading="3. Close your account entirely">
        <p>
          This removes everything in section 2 plus your account itself: your
          email, your password hash, and everything you created here. It cannot
          be undone and there is no backup to restore from afterwards.
        </p>
        <p>
          Email <Mail /> from the address on your account with the subject{" "}
          <span className="text-text">Close my account</span>. It is confirmed
          by reply before anything is deleted, so an email sent by someone else
          cannot close your account.
        </p>
      </Section>

      <Section heading="How long it takes">
        <p>
          Deletions started from Instagram run immediately -- the status page you
          are given reports when they finish. Requests by email are completed
          within 30 days, and you get a reply confirming it. Backups are
          overwritten on a rolling 30-day cycle, so a deleted record can persist
          in a backup for up to 30 days before it is gone for good; it is not
          readable by the application in the meantime.
        </p>
      </Section>

      <Section heading="If something goes wrong">
        <p>
          If a deletion reports a failure, or a status link shows no request,
          email <Mail /> with the confirmation code and it will be finished
          manually.
        </p>
      </Section>
    </PolicyPage>
  );
}
