import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { monogramLetter } from "../lib/catalog";
import type { MethodColor, Tile } from "../lib/types";
import type { Tone } from "../lib/rules";
import { Check, ChevronDown, Moon, STROKE, Sun } from "./icons";

export function Monogram({ name, tile, size = 36 }: { name: string; tile: Tile; size?: 26 | 28 | 36 | 40 }) {
  return (
    <div className={`monogram tile-${tile}${size !== 36 ? ` monogram--${size}` : ""}`} aria-hidden>
      {monogramLetter(name)}
    </div>
  );
}

export function DueChip({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`chip chip--${tone}`}>{label}</span>;
}

export function Dot({ color, size = 8 }: { color: MethodColor; size?: 6 | 8 }) {
  return <span className={`dot mc-${color}${size === 6 ? " dot--6" : ""}`} aria-hidden />;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    />
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  className = "",
}: {
  value: T;
  options: { value: T; label: ReactNode; text?: string }[];
  onChange: (v: T) => void;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={`seg${size === "lg" ? " seg--lg" : ""} ${className}`} role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          className={size === "lg" ? "t-body13m" : "t-cap12m"}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle({ dark, onChange }: { dark: boolean; onChange: (dark: boolean) => void }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button type="button" aria-pressed={!dark} aria-label="Light theme" title="Light" onClick={() => onChange(false)}>
        <Sun size={15} strokeWidth={STROKE} />
      </button>
      <button type="button" aria-pressed={dark} aria-label="Dark theme" title="Dark" onClick={() => onChange(true)}>
        <Moon size={15} strokeWidth={STROKE} />
      </button>
    </div>
  );
}

/** Closes on outside click or Escape. Arrow keys move between items. */
export function Popover({
  onClose,
  style,
  className = "",
  children,
  label,
  autoFocus = true,
}: {
  onClose: () => void;
  style: CSSProperties;
  className?: string;
  children: ReactNode;
  label: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Defer so the click that opened the popover doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);
  useLayoutEffect(() => {
    if (!autoFocus) return;
    const first = ref.current?.querySelector<HTMLElement>("[data-item]:not([disabled])");
    first?.focus();
  }, [autoFocus]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[data-item]:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  };
  return (
    <div ref={ref} className={`popover ${className}`} style={style} role="menu" aria-label={label} data-fit onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  shortcut,
  danger,
  onSelect,
  trailing,
  checked,
}: {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  onSelect: () => void;
  trailing?: ReactNode;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      data-item
      className={`menu-item${danger ? " menu-item--danger" : ""}`}
      onClick={onSelect}
    >
      {icon}
      <span className="menu-item__label t-body13m">{label}</span>
      {shortcut && <span className="t-cap12 c-tertiary">{shortcut}</span>}
      {trailing}
    </button>
  );
}

export function MenuSep() {
  return (
    <div className="menu-sep" role="separator">
      <div />
    </div>
  );
}

/** Pill select (Figma "Select · 9:00 AM") with a small option menu. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btn}
        type="button"
        className="select t-cap12m"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? value}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {current?.label ?? value}
        <ChevronDown size={14} strokeWidth={STROKE} />
      </button>
      {open && (
        <Popover
          label={label}
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
          style={{ right: 0, top: 32, minWidth: 140 }}
          className="option-list scroll"
        >
          {options.map((o) => (
            <MenuItem
              key={o.value}
              label={o.label}
              onSelect={() => {
                onChange(o.value);
                setOpen(false);
                btn.current?.focus();
              }}
              trailing={o.value === value ? <Check size={14} strokeWidth={STROKE} /> : undefined}
            />
          ))}
        </Popover>
      )}
    </div>
  );
}
