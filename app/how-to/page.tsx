import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-items";
import { HELP, WEEKLY_LOOP, WHEN_IT_BREAKS } from "@/lib/help/guide";

export const runtime = "nodejs";

/**
 * How to use the thing.
 *
 * In the app rather than in a document he has to find, because the
 * moment he needs it is the moment he is standing in front of a camera
 * wondering which screen the teleprompter was on. It also ships with the
 * features, so it cannot describe a version he does not have.
 *
 * The page list is built by walking the menu, not by listing pages here.
 * A page added to the menu with no explanation shows up as a gap rather
 * than silently going undocumented, and scripts/check-help.mjs turns
 * that gap into a failing check.
 */
export default function HowToPage() {
  const byHref = new Map(HELP.map((h) => [h.href, h]));
  const labelFor = new Map(NAV_ITEMS.map((n) => [n.href, n.label]));

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-semibold text-text">How to use this</h1>
        <p className="mt-1 text-sm text-muted">
          Start with Your Voice. Everything else works better once that is
          done.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          The week
        </h2>
        <ol className="space-y-2">
          {WEEKLY_LOOP.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-border bg-panel p-3">
              <p className="text-sm font-medium text-text">
                {i + 1}. {step.title}
              </p>
              <p className="mt-1 text-sm text-muted">{step.detail}</p>
              {step.href && (
                <Link
                  href={step.href}
                  className="mt-2 inline-flex h-11 items-center gap-1 text-sm text-accent"
                >
                  {labelFor.get(step.href) ?? "Open"}
                  <ArrowRight size={13} />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          Every screen
        </h2>
        <ul className="space-y-2">
          {/* This page is in the menu and does not need to explain itself. */}
          {NAV_ITEMS.filter((item) => item.href !== "/how-to").map((item) => {
            const help = byHref.get(item.href);
            return (
              <li key={item.href}>
                {/* The whole card is the link, not the title inside it. A
                    line of text is a 17 pixel target, which on a phone
                    means three attempts to open a screen. */}
                <Link
                  href={item.href}
                  className="block rounded-xl border border-border bg-panel p-3"
                >
                  <span className="text-sm font-medium text-accent">{item.label}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {help?.what ?? "Not written up yet."}
                  </span>
                  {help?.when && (
                    <span className="mt-1 block text-xs text-faint">{help.when}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          When it breaks
        </h2>
        <ul className="space-y-2">
          {WHEN_IT_BREAKS.map((row) => (
            <li key={row.problem} className="rounded-xl border border-border bg-panel p-3">
              <p className="text-sm font-medium text-text">{row.problem}</p>
              <p className="mt-1 text-sm text-muted">{row.answer}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          Putting an update on the site
        </h2>
        <ol className="space-y-1.5 rounded-xl border border-border bg-panel p-3 text-sm text-muted">
          <li>1. Download the zip and unzip it into C:\dev\content-studio, replacing files.</li>
          <li>2. If it came with SQL, paste that into Supabase and run it first.</li>
          <li>3. Double click the file that starts with SEND-TO-GITHUB.</li>
          <li>4. It prints a web address. Open it, Create pull request, Merge.</li>
          <li>5. Vercel puts it live on its own, about a minute later.</li>
        </ol>
      </section>
    </div>
  );
}
