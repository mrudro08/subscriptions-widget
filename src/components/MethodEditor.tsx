import { useEffect, useRef, useState } from "react";
import { METHOD_COLORS } from "../lib/catalog";
import { uid } from "../lib/rules";
import type { MethodColor, PaymentMethod } from "../lib/types";
import { Check } from "./icons";

/** Inline editor for a payment method (name + dot colour). Used in the form and in Settings. */
export function MethodEditor({
  initial,
  usedBy = 0,
  existingNames,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: PaymentMethod;
  usedBy?: number;
  existingNames: string[];
  onSave: (m: PaymentMethod) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<MethodColor>(initial?.color ?? nextColor(existingNames.length));
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const save = () => {
    const n = name.trim();
    if (!n) return setError("Give it a name, e.g. Card ••1234");
    if (existingNames.some((x) => x.toLowerCase() === n.toLowerCase() && x !== initial?.name)) {
      return setError("You already have a method with that name");
    }
    onSave({ id: initial?.id ?? uid("m"), name: n.slice(0, 40), color });
  };

  return (
    <div
      className="method-editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className={`input${error ? " is-invalid" : ""}`}>
        <span className={`dot mc-${color}`} />
        <input
          ref={input}
          value={name}
          maxLength={40}
          placeholder="Name, e.g. Card ••1234"
          aria-label="Payment method name"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      {error && <span className="t-cap12 field__error">{error}</span>}
      <div className="swatches" role="radiogroup" aria-label="Colour">
        {METHOD_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-pressed={c === color}
            aria-label={c}
            className={`swatch mc-${c}`}
            onClick={() => setColor(c)}
          >
            {c === color && <Check size={12} strokeWidth={3} color="#fff" />}
          </button>
        ))}
      </div>
      {onDelete && usedBy > 0 && (
        <span className="t-cap12 c-tertiary">
          Used by {usedBy} subscription{usedBy === 1 ? "" : "s"}. Move them to another method before deleting it.
        </span>
      )}
      <div className="btn-row">
        {onDelete && (
          <button
            type="button"
            className={`btn btn--sm btn--danger-outline btn--auto${usedBy > 0 ? " disabled" : ""}`}
            disabled={usedBy > 0}
            onClick={onDelete}
          >
            Delete
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn--sm btn--secondary btn--auto" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--sm btn--primary btn--auto" onClick={save}>
          {initial ? "Save" : "Add method"}
        </button>
      </div>
    </div>
  );
}

function nextColor(n: number): MethodColor {
  return METHOD_COLORS[n % (METHOD_COLORS.length - 1)];
}
