import { fmtShort } from "../lib/dates";
import { money, moneyWhole } from "../lib/money";
import type { DueWindow } from "../lib/rules";
import { Dot } from "./ui";

/** Headline = cash due in the next 30 days, split by payment method. */
export function Summary({ due, yearly, currency }: { due: DueWindow; yearly: number; currency: string }) {
  const total = due.total || 1;
  return (
    <section className="summary" aria-label="Due in the next 30 days">
      <div className="summary__label">
        <span className="t-cap12m c-secondary">Due in the next 30 days</span>
        <span className="t-cap12 c-tertiary">
          {fmtShort(due.from)} – {fmtShort(due.to)}
        </span>
      </div>
      <div className="summary__amount">
        <span className="t-metric40 num">{money(due.total, currency)}</span>
        <span className="t-body14 c-tertiary">
          {due.count === 0 ? "nothing due" : `${due.count} payment${due.count === 1 ? "" : "s"}`}
        </span>
      </div>
      <span className="t-body13 c-tertiary">≈ {moneyWhole(yearly, currency)} a year at current plans</span>
      {due.byMethod.length > 0 && (
        <div className="methods">
          <div className="split" aria-hidden>
            {due.byMethod.map((m) => (
              <div key={m.method.id} className={`split__seg mc-${m.method.color}`} style={{ flexGrow: m.total / total, flexBasis: 0 }} />
            ))}
          </div>
          {due.byMethod.map((m) => (
            <div key={m.method.id} className="method-line">
              <Dot color={m.method.color} />
              <span className="t-body13m nowrap">{m.method.name}</span>
              <span className="method-line__meta t-cap12 c-tertiary ellipsis">
                {m.count === 1 ? `1 payment · ${fmtShort(m.next)}` : `${m.count} payments · next ${fmtShort(m.next)}`}
              </span>
              <span className="t-body13m num">{money(m.total, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
