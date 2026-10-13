import Link from "next/link";

/**
 * Chrome for the public policy pages.
 *
 * These are the only pages a stranger sees, so they carry no app navigation
 * (every link would bounce to /login) but they do link to each other, because
 * Meta's reviewer checks that the privacy policy, terms, and deletion
 * instructions all exist and are reachable.
 */

export const LAST_UPDATED = "12 October 2026";
export const CONTACT_EMAIL = "contact@powersuggs.com";

export function PolicyPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-muted">Content Studio</p>
          <h1 className="text-2xl font-semibold text-text">{title}</h1>
          <p className="text-xs text-muted">Last updated {LAST_UPDATED}</p>
        </header>

        <article className="space-y-6 text-sm leading-relaxed text-muted">
          {children}
        </article>

        <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-xs">
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy policy
          </Link>
          <Link href="/terms" className="text-accent hover:underline">
            Terms of service
          </Link>
          <Link href="/data-deletion" className="text-accent hover:underline">
            Delete your data
          </Link>
          <Link href="/login" className="text-muted hover:underline">
            Sign in
          </Link>
        </footer>
      </div>
    </div>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-medium text-text">{heading}</h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Mail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
      {CONTACT_EMAIL}
    </a>
  );
}
