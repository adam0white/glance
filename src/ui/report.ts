/** The same logbook page serves the sample and each completed watch. */
import { clock, type Dawn, PLANS } from '../sim/dam.ts';
import { NAMES } from '../sim/keepers.ts';
import { spoken } from '../sim/reading.ts';

const esc = (x: string) =>
  x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const CAUSE: Record<string, string> = {
  fresh: 'A plain misread',
  sleepy: 'He was short of sleep, and further behind than he felt',
  trough: 'The small hours, when the body is at its lowest',
  spent: 'He was spent from the wheel',
  weather: 'Rain in his face and a weak torch',
  afraid: 'He was frightened',
  skipped: 'He never walked there; he gave you the last figure',
  gossip: '',
};

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number) => WORDS[n] ?? String(n);

function houseRow(n: number, fate: Dawn['mill']): string {
  return Array.from(
    { length: n },
    (_, i) =>
      `<svg class="house ${fate}" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 18 V9 L10 3 L17 9 V18 Z" fill="${fate === 'flooded' ? 'var(--sky)' : 'none'}" fill-opacity="${fate === 'flooded' ? 0.45 : 0}" stroke="currentColor" stroke-width="1.4"/>${fate === 'saved' ? `<line x1="4" y1="15" x2="16" y2="${15 + (i % 2)}" stroke="var(--sky)" stroke-width="1.4"/>` : ''}</svg>`,
  ).join('');
}

function fateWords(d: Dawn): string {
  if (d.overtopped) {
    const at = d.series.at(-1)?.m;
    return `Water came over the crest of the dam${at === undefined ? '' : ` at ${clock(at)}`}. The record stops there.`;
  }
  const parts: string[] = [];
  parts.push(
    d.mill === 'dry'
      ? 'Mill Lane slept dry.'
      : d.mill === 'saved'
        ? 'Mill Lane took water, but they had their things upstairs.'
        : 'Mill Lane flooded before anyone knocked.',
  );
  if (d.square !== 'dry')
    parts.push(d.square === 'saved' ? 'The square went under; they were ready.' : 'The square went under.');
  if (d.falseAlarm) parts.push('The warning was for nothing. The lane will remember.');
  if (d.spilled && !d.overtopped) parts.push('The dam went over its lip and the spillway ran.');
  return parts.join(' ');
}

/** Why he was off, in the desk's words; Callum errs high, so his tiredness reads differently. */
function causeWords(m: Dawn['misses'][number]): string {
  if (m.who === 'callum' && m.said > m.truth)
    return m.cause === 'afraid' || m.cause === 'sleepy' || m.cause === 'trough'
      ? 'He was tired and frightened, and guessed high to be safe'
      : (CAUSE[m.cause] ?? '');
  return CAUSE[m.cause] ?? '';
}

function missLine(m: Dawn['misses'][number]): string {
  const who = NAMES[m.who];
  const f = m.gauge === 'level' ? spoken(m.said) : m.said.toFixed(2);
  const t = m.gauge === 'level' ? spoken(m.truth) : m.truth.toFixed(2);
  return `<li><span class="t">actual read ${clock(m.at)}</span> ${who} said <b>${f}</b> at the ${m.gauge === 'level' ? 'staff' : 'weir'}. It was ${t}. <span class="soft">${esc(causeWords(m))}.</span>${m.caught ? ' <span class="caught">You caught it.</span>' : ''}</li>`;
}

export function reportBody(d: Dawn, crew: boolean, sample = false): string {
  const caught = d.misses.filter((m) => m.caught).length;
  return `    <h2>${sample ? 'A sample morning' : `${PLANS[d.night - 1]?.title ?? ''}, first light`}</h2>
    <p>${esc(fateWords(d))}</p>
    <canvas id="chart" class="chart" aria-label="${sample ? 'Sample night: opening the gate lowered the dam level; the river rose later. The water stayed below the crest and the town stayed dry.' : "The night's true level against his figures"}"></canvas>
    <p class="soft legend"><span class="key red"></span> what the water did <span class="key dot"></span> what ${crew ? 'they' : 'he'} told you, at the actual reading time</p>
    <div class="houses"><span class="soft">Mill Lane</span>${houseRow(4, d.overtopped ? 'flooded' : d.mill)}<span class="soft">square</span>${houseRow(6, d.overtopped ? 'flooded' : d.square)}</div>
    ${d.misses.length ? `<h3>Where the board was wrong</h3><ul class="misses">${d.misses.slice(0, 6).map(missLine).join('')}</ul><p class="soft">A figure counts as caught when you had it read again within twenty minutes, or lightning showed the wall. ${caught ? `You caught ${count(caught)} of ${count(d.misses.length)}.` : 'You caught none of them.'}</p>` : '<p>Every figure tonight was near enough the truth.</p>'}
    ${d.dozes.map((z) => `<p class="soft">${NAMES[z.who]} fell asleep on watch, ${clock(z.from)} to ${clock(z.to)}.</p>`).join('')}
    ${d.strain.map((id) => `<p class="soft">${NAMES[id]} hurt his shoulder on the wheel. He didn’t say.</p>`).join('')}
    ${d.lines
      .map(
        (l) =>
          `<div class="keeperline"><b>${NAMES[l.id]}</b>${l.line ? `<p class="hand">${esc(l.line)}</p>` : ''}<p class="hand">${esc(l.aboutYou)}</p></div>`,
      )
      .join('')}
`;
}
