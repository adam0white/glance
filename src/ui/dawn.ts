/**
 * The dawn logbook: the night's true level in red ink over the keepers' pencilled figures, the gate along the
 * foot, the river at the bridge beneath. Drawn once per dawn on a canvas.
 */
import type { Dawn } from '../sim/dam.ts';
import { CREST, LIP, MILL_LANE, SQUARE } from '../sim/water.ts';

const W = 340;
const H = 300;

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export function drawDawn(canvas: HTMLCanvasElement, d: Dawn) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth || W;
  const k = cw / W;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(H * k * dpr);
  canvas.style.height = `${H * k}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  const ink = css('--ink');
  const soft = css('--ink-soft');
  const rope = css('--rope');
  const sky = css('--sky');
  ctx.lineCap = 'round';
  const t0 = d.series[0]?.m ?? 0;
  const span = 480;
  const x = (m: number) => 30 + ((m - t0) / span) * (W - 40);
  const lo = 3.4;
  const hi = 6.3;
  const y = (v: number) => 20 + ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * 150;
  // Grid: the lip and the crest.
  ctx.font = '11px Literata, serif';
  ctx.fillStyle = soft;
  ctx.strokeStyle = soft;
  ctx.lineWidth = 0.8;
  for (const [v, name] of [
    [CREST, 'crest'],
    [LIP, 'lip'],
    [4, '4.0'],
  ] as const) {
    ctx.setLineDash(v === CREST ? [] : [2, 4]);
    ctx.beginPath();
    ctx.moveTo(30, y(v));
    ctx.lineTo(W - 10, y(v));
    ctx.stroke();
    ctx.fillText(name, 0, y(v) + 4);
  }
  ctx.setLineDash([]);
  for (let h = 0; h <= 8; h += 2) {
    const m = t0 + h * 60;
    ctx.fillText(`${String((22 + h) % 24).padStart(2, '0')}`, x(m) - 6, 186);
  }
  // Truth in red ink.
  ctx.strokeStyle = rope;
  ctx.lineWidth = 2;
  ctx.beginPath();
  d.series.forEach((p, i) => {
    if (i === 0) ctx.moveTo(x(p.m), y(p.level));
    else ctx.lineTo(x(p.m), y(p.level));
  });
  ctx.stroke();
  // Lightning ticks.
  ctx.strokeStyle = soft;
  ctx.lineWidth = 1;
  for (const f of d.flashes) {
    ctx.beginPath();
    ctx.moveTo(x(f.at), 12);
    ctx.lineTo(x(f.at) - 3, 18);
    ctx.lineTo(x(f.at) + 1, 18);
    ctx.lineTo(x(f.at) - 2, 24);
    ctx.stroke();
  }
  // His figures in pencil: Dai a dot, Callum a ring; a dashed stalk to the truth when he was off.
  for (const r of d.reports) {
    if (r.gauge !== 'level') continue;
    const px = x(r.at);
    const py = y(r.value);
    if (Math.abs(r.value - r.truth) >= 0.2) {
      ctx.strokeStyle = soft;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, y(r.truth));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(px, py, 2.8, 0, Math.PI * 2);
    if (r.who === 'dai') ctx.fill();
    else ctx.stroke();
  }
  // Gate along the foot.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  d.series.forEach((p, i) => {
    const gy = 214 - p.gate * 3.5;
    if (i === 0) ctx.moveTo(x(p.m), gy);
    else ctx.lineTo(x(p.m), gy);
  });
  ctx.stroke();
  ctx.fillStyle = soft;
  ctx.fillText('gate', 0, 210);
  // The bridge.
  const by = (v: number) => 292 - ((Math.min(6.2, v) - 0.5) / 5.7) * 72;
  ctx.strokeStyle = soft;
  ctx.setLineDash([2, 4]);
  for (const [v, name] of [
    [MILL_LANE, 'Mill Lane'],
    [SQUARE, 'square'],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(30, by(v));
    ctx.lineTo(W - 10, by(v));
    ctx.stroke();
    ctx.fillText(name, W - 64, v === SQUARE ? by(v) - 3 : by(v) + 11);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = sky;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  d.series.forEach((p, i) => {
    if (i === 0) ctx.moveTo(x(p.m), by(p.bridge));
    else ctx.lineTo(x(p.m), by(p.bridge));
  });
  ctx.stroke();
  ctx.fillText('bridge', 0, 280);
  if (d.warnedAt !== null) {
    ctx.fillStyle = rope;
    ctx.fillText('▲ warned', x(d.warnedAt) - 4, 298);
  }
}
