import { fmtMonthYear, monthInitial, monthShort } from "../lib/dates";
import { money } from "../lib/money";
import type { Chart } from "../lib/rules";
import { ChevronDown, ChevronUp, STROKE } from "./icons";

const BAR_W = 16;
const AREA_W = 296;
const BASE = 22; // bars sit above the month labels
const MAX_BAR = 58;

/** "Charged per month" — collapsed to one line by default, expands to 12 bars. */
export function ChartCard({
  chart,
  open,
  onToggle,
  currency,
}: {
  chart: Chart;
  open: boolean;
  onToggle: () => void;
  currency: string;
}) {
  const { current, previous } = chart;
  const diff = current.total - previous.total;
  const showDiff = previous.tracked && previous.total > 0 && diff !== 0;
  const peak = Math.max(1, ...chart.bars.map((b) => b.total), chart.average ?? 0);

  const sub = open ? (
    <>
      {monthShort(current.month)} {money(current.total, currency)} ·{" "}
      {current.stillDue > 0 ? `${money(current.stillDue, currency)} still due this month` : "all charged"}
    </>
  ) : (
    <>
      {monthShort(current.month)} {money(current.total, currency)}
      {showDiff && (
        <>
          {" · "}
          <span className={diff < 0 ? "c-success" : "c-secondary"}>
            {diff < 0 ? "↓" : "↑"} {money(Math.abs(diff), currency)}
          </span>
        </>
      )}
    </>
  );

  return (
    <section className="chart" aria-label="Charged per month">
      <div
        className="chart__head"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="chart__text">
          <span className="t-body13m">Charged per month</span>
          <span className="t-cap12 c-tertiary nowrap">{sub}</span>
        </div>
        {!open && (
          <div className="mini-bars" aria-hidden>
            {chart.bars.map((b) => (
              <span
                key={b.month}
                className={b.current ? "is-current" : b.tracked ? "" : "is-untracked"}
                style={{ height: Math.max(2, Math.round((b.total / peak) * 22)) }}
              />
            ))}
          </div>
        )}
        <span className="icon-btn icon-btn--ghost" aria-hidden>
          {open ? <ChevronUp size={16} strokeWidth={STROKE} /> : <ChevronDown size={16} strokeWidth={STROKE} />}
        </span>
      </div>
      {open && <Bars chart={chart} peak={peak} currency={currency} />}
    </section>
  );
}

function Bars({ chart, peak, currency }: { chart: Chart; peak: number; currency: string }) {
  const step = (AREA_W - BAR_W) / 11;
  const h = (v: number) => Math.max(4, Math.round((v / peak) * MAX_BAR * 10) / 10);
  const avgY = chart.average != null ? BASE + (chart.average / peak) * MAX_BAR : null;

  // Label the tallest bar when a yearly plan made it spike.
  let spike = -1;
  chart.bars.forEach((b, i) => {
    if (b.yearly.length && (spike < 0 || b.total > chart.bars[spike].total)) spike = i;
  });
  if (spike >= 0 && chart.average && chart.bars[spike].total < chart.average * 1.3) spike = -1;

  return (
    <div className="bars" role="img" aria-label={chart.bars.map((b) => `${fmtMonthYear(b.month)} ${money(b.total, currency)}`).join(", ")}>
      {chart.trackedMonths <= 1 && (
        <span className="bars__hint t-cap12 c-tertiary">History builds as payments are recorded</span>
      )}
      {chart.bars.map((b, i) => (
        <div key={b.month}>
          <div
            className={`bars__bar${b.current ? " is-current" : b.tracked ? "" : " is-untracked"}`}
            style={{ left: i * step, height: b.tracked ? h(b.total) : 4 }}
            title={`${fmtMonthYear(b.month)} · ${b.tracked ? money(b.total, currency) : "not tracked yet"}${b.current && b.stillDue ? ` (${money(b.stillDue, currency)} still due)` : ""}`}
          />
          <span className={`bars__label t-cap12 c-tertiary${b.current ? " is-current" : ""}`} style={{ left: i * step }}>
            {monthInitial(b.month)}
          </span>
        </div>
      ))}
      {avgY != null && (
        <>
          <div className="bars__avg" style={{ bottom: avgY }} />
          <span className="bars__avg-tag t-cap12m" style={{ right: 8, bottom: avgY + 6 }}>
            12-mo avg {money(chart.average!, currency)}
          </span>
        </>
      )}
      {spike >= 0 && (
        <span
          className="bars__note t-cap12 c-secondary"
          style={
            spike < 7
              ? { left: spike * step + BAR_W + 6, bottom: BASE + h(chart.bars[spike].total) - 16 }
              : { right: AREA_W - spike * step + 6, bottom: BASE + h(chart.bars[spike].total) - 16 }
          }
        >
          {chart.bars[spike].yearly[0]} · yearly
        </span>
      )}
    </div>
  );
}
