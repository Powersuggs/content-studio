import Link from "next/link";
import { Bullets, Mail, PolicyPage, Section } from "@/components/PolicyPage";

export const metadata = {
  title: "Terms of service - Content Studio",
  description: "The terms for using Content Studio.",
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of service">
      <p>
        These terms cover your use of Content Studio. Using the app means you
        accept them.
      </p>

      <Section heading="What the service is">
        <p>
          Content Studio analyses social media posts you own and helps you draft
          new ones. It is a drafting and analysis tool. It does not publish
          anything for you, and everything it produces is a draft for you to
          review before you use it.
        </p>
      </Section>

      <Section heading="Your account">
        <Bullets
          items={[
            "You are responsible for keeping your password to yourself and for what happens under your account.",
            "One account is for one person or business. Do not share logins.",
            "Tell us at the address below if you think someone else has access to your account.",
          ]}
        />
      </Section>

      <Section heading="What you may not do">
        <Bullets
          items={[
            "Connect an Instagram account you do not own or are not authorised to manage.",
            "Use the app to analyse or scrape accounts that are not yours.",
            "Attempt to reach another customer's data, or to probe, overload, or interfere with the service.",
            "Use the app for anything unlawful, or in a way that breaks Instagram's or Meta's own terms.",
          ]}
        />
      </Section>

      <Section heading="Your content">
        <p>
          What you write and upload stays yours. You grant only the permission
          needed to run the service: to store it, process it, and send it to the
          AI providers listed in the{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            privacy policy
          </Link>{" "}
          so the analysis and drafts can be produced. Nothing you write is used
          to train anyone&apos;s models by us.
        </p>
      </Section>

      <Section heading="AI output">
        <p>
          The analysis, scripts, and suggestions are machine-generated. They can
          be wrong, and they are not advice. You are responsible for reviewing
          anything before you publish it, and for making sure it complies with
          whatever rules apply to you -- including, if you work in a regulated
          field such as mortgage lending or real estate, your own licensing and
          advertising requirements.
        </p>
      </Section>

      <Section heading="Third-party platforms">
        <p>
          The Instagram connection depends on Meta&apos;s APIs, which Meta can
          change or withdraw. If that breaks a feature, there may be nothing to
          be done about it here. Content Studio is not affiliated with, endorsed
          by, or operated by Meta or Instagram.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          The service is provided as-is, with no promise of uninterrupted
          availability. It may be taken down for maintenance, and features may
          change.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          To the extent the law allows, Content Studio and its operator are not
          liable for lost profits, lost data, or any indirect or consequential
          loss arising from your use of the service. Nothing here limits
          liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section heading="Ending your use">
        <p>
          You may stop and delete your account at any time -- see{" "}
          <Link href="/data-deletion" className="text-accent hover:underline">
            the deletion page
          </Link>
          . Accounts that breach these terms may be suspended or closed.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the laws of the State of Arizona, United
          States.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms: <Mail />.
        </p>
      </Section>
    </PolicyPage>
  );
}
