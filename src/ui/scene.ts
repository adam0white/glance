/**
 * The scene: one inked page with the dam in section, the reservoir drawn at the level he last reported (never the
 * truth), the hut, the gate wheel, the staff gauge, the path up to the weir, the river down to the inn, rain, and
 * the keepers walking between them. Lightning is the only moment the truth is drawn: a flash, then a pencil ghost.
 */
import { readPerson } from '@adam0white/human-framework';
import { clock, type GameState, keeperOf, type Place, personOf, planOf } from '../sim/dam.ts';
import { KEEPERS, type KeeperId, NAMES, WATCH_FROM } from '../sim/keepers.ts';
import { rainAt } from '../sim/water.ts';
import { readingTime } from './time.ts';

export const SCENE_H = 236;
const W = 360;

const yOf = (level: number) => 214 - (level - 2) * 38; // 2.0 m → 214, 6.0 m → 62
const DAM_FACE = 168;
const DAM_TOP_X = 186;
const CREST_Y = yOf(6.0);

interface Pt {
  x: number;
  y: number;
}
const PLACES: Record<Place, Pt> = {
  hut: { x: 268, y: CREST_Y + 2 },
  gate: { x: 196, y: CREST_Y - 2 },
  staff: { x: DAM_FACE - 4, y: yOf(4.2) },
  weir: { x: 16, y: 40 },
};

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

/** Deterministic wobble so the ink does not crawl between frames. */
function wob(ctx: CanvasRenderingContext2D, pts: Pt[], key: number, amp = 1.1) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const j = i === 0 || i === pts.length - 1 ? 0 : Math.sin(key * 12.9898 + i * 78.233) * amp;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x + j * 0.5, p.y + j);
  });
  ctx.stroke();
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  key: number,
  amp = 1,
) {
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 18));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push({ x: x1 + ((x2 - x1) * i) / n, y: y1 + ((y2 - y1) * i) / n });
  wob(ctx, pts, key, amp);
}

export interface SceneFx {
  /** performance.now() of the last flash shown, for the white-out. */
  flashAt: number;
}

export function drawScene(canvas: HTMLCanvasElement, s: GameState, fx: SceneFx, now: number) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth || W;
  const ch = canvas.clientHeight || SCENE_H;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const k = Math.min(cw / W, ch / SCENE_H);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, (dpr * (cw - W * k)) / 2, 0);
  const ink = css('--ink');
  const soft = css('--ink-soft');
  const rope = css('--rope');
  const sky = css('--sky');
  const paper = css('--paper');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, SCENE_H / k + 40);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const plan = planOf(s);
  const m = s.minute - (Math.floor(s.minute / 1440) * 1440 + WATCH_FROM);

  // Hills.
  ctx.strokeStyle = soft;
  ctx.lineWidth = 1.2;
  wob(
    ctx,
    [
      { x: 0, y: 34 },
      { x: 50, y: 18 },
      { x: 110, y: 30 },
      { x: 170, y: 14 },
      { x: 240, y: 28 },
      { x: 300, y: 16 },
      { x: 360, y: 30 },
    ],
    3,
    2,
  );

  // Rain: as heavy as it looks from the desk (approximate on purpose).
  const rain = rainAt(s.seed, s.night, Math.max(0, m), plan.storm);
  ctx.strokeStyle = sky;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  const drops = Math.min(70, Math.round(rain * 4));
  for (let i = 0; i < drops; i++) {
    const x = (i * 53.7 + (s.minute % 7) * 11) % W;
    const y = (i * 31.3 + (s.minute % 5) * 17) % (SCENE_H - 20);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y + 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // The reservoir, drawn at the level he last reported, hatched in pencil, fading as it ages.
  const rep = s.board.level;
  if (rep) {
    const age = s.minute - rep.at;
    const y = yOf(rep.value);
    ctx.globalAlpha = Math.max(0.25, 1 - age / 120);
    ctx.strokeStyle = sky;
    ctx.lineWidth = 1;
    for (let x = 4; x < DAM_FACE - 2; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, Math.max(y + 3, y + 3 + ((x * 7) % 5)));
      ctx.lineTo(Math.min(DAM_FACE - 2, x + 12), 214);
      ctx.stroke();
    }
    ctx.lineWidth = 1.6;
    line(ctx, 2, y, DAM_FACE - 1, y, rep.at, 0.8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.font = '600 15px Caveat, cursive';
    ctx.fillText(`${rep.value.toFixed(1)} m · ${NAMES[rep.who as KeeperId] ?? ''}`, 8, y - 22);
    ctx.fillText(readingTime(rep), 8, y - 6);
  }

  // The flash: the true level, for an instant, then a pencil ghost for half an hour.
  const lastFlash = s.flashes.at(-1);
  if (lastFlash && s.minute - lastFlash.at <= 30) {
    const y = yOf(lastFlash.level);
    const fresh = now - fx.flashAt < 900;
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = fresh ? rope : soft;
    ctx.lineWidth = fresh ? 2.2 : 1.2;
    ctx.globalAlpha = fresh ? 1 : Math.max(0.3, 1 - (s.minute - lastFlash.at) / 30);
    line(ctx, 2, y, DAM_FACE - 1, y, 99, 0.3);
    ctx.restore();
    ctx.fillStyle = soft;
    ctx.font = 'italic 12px Literata, serif';
    ctx.fillText(`lightning ${clock(lastFlash.at)}`, 96, y + 13);
  }

  // The dam in section.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.6;
  wob(
    ctx,
    [
      { x: DAM_FACE, y: 216 },
      { x: DAM_FACE, y: CREST_Y },
      { x: DAM_TOP_X + 18, y: CREST_Y },
      { x: 236, y: 216 },
    ],
    7,
    0.6,
  );
  line(ctx, 0, 216, W, 216, 8, 0.6);
  // The overflow lip: a notch in the crest drawing, labelled.
  ctx.strokeStyle = soft;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  line(ctx, DAM_FACE - 40, yOf(5.0), DAM_FACE, yOf(5.0), 9, 0);
  ctx.setLineDash([]);
  ctx.fillStyle = soft;
  ctx.font = '11px Literata, serif';
  ctx.textAlign = 'right';
  ctx.fillText('lip 5.0', DAM_FACE - 3, yOf(5.0) - 3);
  ctx.fillText('crest 6.0', DAM_FACE - 3, CREST_Y + 11);
  ctx.textAlign = 'left';
  // The '79 mark on the wall.
  ctx.strokeStyle = rope;
  ctx.lineWidth = 1.4;
  line(ctx, DAM_FACE + 3, yOf(5.9), DAM_FACE + 13, yOf(5.9), 12, 0);
  ctx.fillStyle = s.night >= 5 ? rope : soft;
  ctx.font = '600 13px Caveat, cursive';
  ctx.fillText('’79', DAM_FACE + 4, yOf(5.9) + 13);
  // Staff gauge ticks.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  for (let v = 2; v <= 6; v += 0.5) {
    const y = yOf(v);
    ctx.beginPath();
    ctx.moveTo(DAM_FACE - (v % 1 === 0 ? 7 : 4), y);
    ctx.lineTo(DAM_FACE, y);
    ctx.stroke();
  }
  // Gate wheel.
  ctx.beginPath();
  ctx.arc(PLACES.gate.x, PLACES.gate.y - 9, 6, 0, Math.PI * 2);
  ctx.stroke();
  line(ctx, PLACES.gate.x, PLACES.gate.y - 3, PLACES.gate.x, CREST_Y, 13, 0);
  // Release below the dam: the gate's water, drawn from what he last reported.
  const gateRep = s.board.gate?.value ?? 0;
  ctx.strokeStyle = sky;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < gateRep; i++) line(ctx, 236 + i * 3, 212 - i, 300 + i * 6, 212 - i * 0.5, 20 + i, 0.8);
  // Hut on the bank.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  const hx = PLACES.hut.x;
  const hy = PLACES.hut.y;
  wob(
    ctx,
    [
      { x: hx - 16, y: hy + 18 },
      { x: hx - 16, y: hy },
      { x: hx, y: hy - 12 },
      { x: hx + 16, y: hy },
      { x: hx + 16, y: hy + 18 },
      { x: hx - 16, y: hy + 18 },
    ],
    14,
    0.5,
  );
  ctx.fillStyle = rope;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(hx - 4, hy + 4, 7, 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = soft;
  ctx.font = '11px Literata, serif';
  ctx.fillText('hut', hx - 8, hy + 30);
  // The path up to the weir.
  ctx.strokeStyle = soft;
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  line(ctx, PLACES.gate.x - 8, CREST_Y - 4, 60, 52, 15, 1.4);
  line(ctx, 60, 52, PLACES.weir.x + 4, PLACES.weir.y, 16, 1.4);
  ctx.setLineDash([]);
  ctx.fillText(plan.weir ? 'weir path' : '', 66, 46);
  if (plan.weir) {
    ctx.strokeStyle = ink;
    line(ctx, 4, 44, 26, 44, 17, 0.4);
  }
  // The inn by the bridge, far downstream.
  if (plan.inn) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;
    wob(
      ctx,
      [
        { x: 322, y: 214 },
        { x: 322, y: 196 },
        { x: 334, y: 188 },
        { x: 346, y: 196 },
        { x: 346, y: 214 },
      ],
      18,
      0.4,
    );
    ctx.fillStyle = s.nerys.ringing !== null ? rope : soft;
    ctx.fillRect(331, 200, 5, 5);
    ctx.fillStyle = soft;
    ctx.fillText('inn', 326, 230);
  }
  // Tree on the screen: drawn only once he has said so.
  if (s.treeKnown && s.water.blocked) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    line(ctx, DAM_FACE - 30, yOf(3.4), DAM_FACE - 2, yOf(2.6), 21, 1.5);
    line(ctx, DAM_FACE - 22, yOf(3.2), DAM_FACE - 30, yOf(2.7), 22, 1.5);
  }

  // The keepers.
  for (const id of KEEPERS) {
    const kp = keeperOf(s, id);
    if (!kp.on) continue;
    figure(ctx, s, id, ink, soft, rope);
  }
  // Static on the radio.
  if (s.radioOut) {
    ctx.fillStyle = soft;
    ctx.font = 'italic 13px Literata, serif';
    ctx.fillText('radio: static', 250, 50);
  }
  // White-out.
  const since = now - fx.flashAt;
  if (since < 260) {
    ctx.fillStyle = paper;
    ctx.globalAlpha = 0.85 * (1 - since / 260);
    ctx.fillRect(0, 0, W, SCENE_H);
    ctx.globalAlpha = 1;
  }
}

export function keeperPoint(s: GameState, id: KeeperId): Pt {
  const kp = keeperOf(s, id);
  const j = kp.job;
  const off = id === 'callum' ? 20 : 0;
  if (!j) return { x: PLACES[kp.place].x + off, y: PLACES[kp.place].y };
  const t = j.walk === 0 ? 1 : Math.min(1, (s.minute - j.startedAt) / j.walk);
  const a = PLACES[j.from];
  const b = PLACES[j.to];
  return { x: a.x + (b.x - a.x) * t + off, y: a.y + (b.y - a.y) * t };
}

function figure(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  id: KeeperId,
  ink: string,
  soft: string,
  rope: string,
) {
  const p = personOf(s, id);
  const pt = keeperPoint(s, id);
  const act = p.activity?.affordanceId;
  const asleep = act === 'doze' || act === 'nap';
  // Posture from how he is: a tired man stoops (the only hint of his state that is not words).
  const stoop = Math.min(1, Math.max(0, (readPerson(p).body.sleepiness - 0.5) * 2)) * 4;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.6;
  const x = pt.x;
  const y = pt.y;
  if (asleep) {
    ctx.beginPath();
    ctx.arc(x - 6, y - 4, 3, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, x - 3, y - 3, x + 8, y - 2, 30, 0.3);
    ctx.fillStyle = soft;
    ctx.font = '600 14px Caveat, cursive';
    ctx.fillText('z', x + 6, y - 10);
  } else {
    ctx.beginPath();
    ctx.arc(x + stoop * 0.6, y - 19 + stoop * 0.4, 3, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, x + stoop * 0.5, y - 16 + stoop * 0.4, x, y - 7, 31, 0.2);
    line(ctx, x, y - 7, x - 3, y, 32, 0.2);
    line(ctx, x, y - 7, x + 3, y, 33, 0.2);
    line(ctx, x + stoop * 0.3, y - 13, x + 5, y - 9, 34, 0.2);
    // Torch when out of the hut.
    if (keeperOf(s, id).job || keeperOf(s, id).place !== 'hut') {
      ctx.fillStyle = rope;
      ctx.beginPath();
      ctx.arc(x + 6, y - 9, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = ink;
  ctx.font = '600 13px Caveat, cursive';
  ctx.fillText(NAMES[id], id === 'callum' ? x - 4 : x - 10, y + 12);
}

export function sceneHit(
  s: GameState,
  x: number,
  y: number,
  cw: number,
  ch = SCENE_H,
): KeeperId | 'inn' | 'dam' | null {
  const k = Math.min(cw / W, ch / SCENE_H);
  const sx = (x - (cw - W * k) / 2) / k;
  const sy = y / k;
  if (sx < 0 || sx > W || sy < 0 || sy > SCENE_H) return null;
  for (const id of KEEPERS) {
    if (!keeperOf(s, id).on) continue;
    const pt = keeperPoint(s, id);
    if (Math.hypot(sx - pt.x, sy - (pt.y - 8)) < 22) return id;
  }
  if (planOf(s).inn && sx > 310 && sy > 180) return 'inn';
  if (sx < DAM_FACE) return 'dam';
  return null;
}
