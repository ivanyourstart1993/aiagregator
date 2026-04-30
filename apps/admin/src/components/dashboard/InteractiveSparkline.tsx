'use client';

import { useState, type MouseEvent } from 'react';

interface Props {
  revenue: number[];
  cost: number[];
  labels: string[];
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

const W = 800;
const H = 140;
const PAD = 8;

export function InteractiveSparkline({ revenue, cost, labels }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (revenue.length === 0) return null;
  const max = Math.max(...revenue, ...cost, 0.01);
  const xStep = (W - PAD * 2) / Math.max(revenue.length - 1, 1);

  const xOf = (i: number) => PAD + i * xStep;
  const yOf = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const toPath = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`)
      .join(' ');

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((x - PAD) / xStep);
    if (idx >= 0 && idx < revenue.length) setHoverIdx(idx);
  }
  function onLeave() {
    setHoverIdx(null);
  }

  const totalRev = revenue.reduce((s, v) => s + v, 0);
  const totalCost = cost.reduce((s, v) => s + v, 0);
  const lastIdx = revenue.length - 1;
  const displayIdx = hoverIdx ?? lastIdx;
  const displayRev = revenue[displayIdx] ?? 0;
  const displayCost = cost[displayIdx] ?? 0;
  const displayLabel = labels[displayIdx] ?? '';

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-32 w-full cursor-crosshair"
        role="img"
        aria-label="revenue and cost over time"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <path
          d={toPath(cost)}
          fill="none"
          stroke="rgb(244 63 94)"
          strokeWidth="1.5"
          opacity="0.7"
        />
        <path
          d={toPath(revenue)}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="2"
        />
        {hoverIdx != null && (
          <>
            <line
              x1={xOf(hoverIdx)}
              x2={xOf(hoverIdx)}
              y1={PAD}
              y2={H - PAD}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="0.5"
              strokeDasharray="2 3"
              opacity="0.5"
            />
            <circle
              cx={xOf(hoverIdx)}
              cy={yOf(revenue[hoverIdx]!)}
              r="3"
              fill="rgb(16 185 129)"
            />
            <circle
              cx={xOf(hoverIdx)}
              cy={yOf(cost[hoverIdx]!)}
              r="2.5"
              fill="rgb(244 63 94)"
              opacity="0.8"
            />
          </>
        )}
      </svg>
      <div className="mt-2 grid grid-cols-3 items-baseline gap-3 text-xs">
        <div className="text-muted-foreground">
          сумма: revenue{' '}
          <span className="font-mono text-emerald-500">{fmtUSD(totalRev)}</span> ·
          cost <span className="font-mono text-rose-500">{fmtUSD(totalCost)}</span>
        </div>
        <div className="text-center text-muted-foreground">
          {hoverIdx != null ? (
            <span>
              <span className="font-mono">{displayLabel}</span>:{' '}
              <span className="font-mono text-emerald-500">{fmtUSD(displayRev)}</span>
              {' / '}
              <span className="font-mono text-rose-500">{fmtUSD(displayCost)}</span>
            </span>
          ) : (
            <span>наведи курсор для деталей</span>
          )}
        </div>
        <div className="text-right text-muted-foreground">
          последний день:{' '}
          <span className="font-mono text-emerald-500">
            {fmtUSD(revenue[lastIdx] ?? 0)}
          </span>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}
