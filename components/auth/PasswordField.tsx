"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * A password box you can look at.
 *
 * Typing a long password blind on a phone keyboard is how people end up
 * locked out of their own account, and the recovery for that costs the
 * owner a reset and a message. A toggle is cheaper than the support.
 *
 * It starts hidden and goes back to hidden on its own after a while,
 * because the common case for pressing it is "did I fat-finger that",
 * not "leave my password on screen while I walk away".
 */
export default function PasswordField({
  name,
  placeholder,
  autoComplete = "current-password",
  value,
  onChange,
  required,
  autoFocus,
  className,
}: {
  name?: string;
  placeholder?: string;
  autoComplete?: string;
  /** Left out for an uncontrolled field inside a plain form post. */
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(false);

  function toggle() {
    setShown((was) => {
      const next = !was;
      if (next) {
        window.setTimeout(() => setShown(false), 15000);
      }
      return next;
    });
  }

  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : {})}
        // Room on the right for the button, so a long password does not
        // run underneath it.
        className={
          className ??
          "w-full rounded-lg border border-border bg-panel-2 py-2 pl-3 pr-12 text-sm text-text outline-none focus:border-accent"
        }
      />
      <button
        type="button"
        onClick={toggle}
        // Not in the tab order: someone tabbing from the password box
        // expects to land on the submit button, not on this.
        tabIndex={-1}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 flex h-9 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-accent"
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
