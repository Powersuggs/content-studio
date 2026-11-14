import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const metadata = {
  title: "Create your account - Content Studio",
};

/**
 * Signup, by invite code.
 *
 * Public, because someone creating an account by definition cannot be signed
 * in yet. The invite code is what stands in for email verification until
 * there is an email provider to verify with.
 */

const ERRORS: Record<string, string> = {
  code: "That invite code is not valid, has already been used, or has expired.",
  email: "That does not look like an email address.",
  short: `Your password needs to be at least ${MIN_PASSWORD_LENGTH} characters. Try a few words strung together.`,
  mismatch: "The two passwords do not match. Check for a typo in the second box.",
  taken: "There is already an account with that email. Sign in instead.",
  failed: "Something went wrong creating the account. Your code was not used up. Try again.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form
        method="POST"
        action="/api/signup"
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-panel p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-text">Content Studio</h1>
          <p className="mt-1 text-sm text-muted">
            Create your account. You will need an invite code.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-muted">Invite code</span>
          <input
            name="code"
            defaultValue={params.code ?? ""}
            autoFocus
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 font-mono text-sm uppercase text-text outline-none placeholder:text-faint focus:border-accent"
          />
          {/* The code is tidied up before it is checked, so saying so
              here saves people retyping one that would have worked. */}
          <span className="block text-[11px] text-faint">
            From the person who invited you. Dashes and capitals do not matter.
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          {/*
            Says what helps rather than what is forbidden. Nothing here
            is a restriction: every character is accepted, because the
            password is scrambled before it is stored and the app never
            passes it anywhere that could choke on a symbol. A rule like
            "no special characters" would only make people's passwords
            weaker, which is why there isn't one.

            Length is the thing that actually matters, so that is what
            the hint pushes, with an example of the shape to aim for.
          */}
          <span className="block text-[11px] text-faint">
            At least {MIN_PASSWORD_LENGTH} characters. Any letters, numbers or
            symbols. A few words strung together, like
            {" "}<span className="text-muted">coffee boat tuesday</span>, beats
            a short one with symbols in it.
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted">Confirm password</span>
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        {params.error && (
          <p className="text-xs text-warn">
            {ERRORS[params.error] ?? "That did not work."}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg"
        >
          Create account
        </button>

        <p className="text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>

        <p className="text-center text-[11px] text-faint">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="hover:underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
