// Headless balance measure: play the week with a few fixed policies and print how each night went.
// node scripts/measure.ts [seed...]
import {
  type GameState,
  type Job,
  keeperOf,
  NIGHTS,
  newGame,
  planOf,
  queueInput,
  step,
  watchFrom,
} from '../src/sim/dam.ts';
import type { KeeperId } from '../src/sim/keepers.ts';
import { inflowOf, TURNS } from '../src/sim/water.ts';

type Policy = 'idle' | 'trusting' | 'careful' | 'oracle';

function lead(s: GameState): KeeperId {
  const plan = planOf(s);
  if (plan.keepers.length === 1) return 'dai';
  // Two keepers: the one who is not busy.
  const free = plan.keepers.find((id) => !keeperOf(s, id).job);
  return free ?? 'dai';
}

function ask(s: GameState, keeper: KeeperId, job: Job, target?: number) {
  const inp: Parameters<typeof queueInput>[1] =
    target === undefined ? { kind: 'ask', keeper, job } : { kind: 'ask', keeper, job, target };
  queueInput(s, inp);
}

function play(seed: number, policy: Policy) {
  const s = newGame(seed);
  let lastGateAsk = -999;
  while (s.phase !== 'end') {
    if (s.phase === 'dawn') {
      queueInput(s, { kind: 'next' });
      lastGateAsk = -999;
      continue;
    }
    const m = s.minute - watchFrom(s.night);
    if (policy !== 'idle') {
      if (m % 30 === 10) ask(s, lead(s), 'level');
      const known =
        policy === 'oracle'
          ? s.water.level
          : (s.board.level?.value ?? 4) + (policy === 'careful' && s.board.level?.who === 'dai' ? 0.2 : 0);
      if (m % 20 === 15 && s.minute - lastGateAsk > 25) {
        let want = known > 4.9 ? TURNS : known > 4.6 ? 4 : known > 4.4 ? 3 : known > 4.2 ? 2 : 1;
        if (policy === 'oracle') {
          const need = inflowOf(s.water) + (s.water.level - 4.4) * 10;
          want = 0;
          while (want < TURNS && 0.4 + 2.3 * want * Math.sqrt(Math.max(0, s.water.level - 2)) < need) want++;
        }
        let target = want;
        const bridge = s.board.bridge?.value ?? 0;
        if (bridge >= 4 && known < 5.3) target = Math.max(1, want - 2);
        if (target !== s.water.gate) {
          ask(s, policy === 'oracle' ? lead(s) : lead(s), 'gate', target);
          lastGateAsk = s.minute;
        }
      }
      if (planOf(s).inn && m % 60 === 30) queueInput(s, { kind: 'ring' });
      if (planOf(s).inn && s.warnedAt === null && (s.board.bridge?.value ?? 0) >= 4)
        queueInput(s, { kind: 'warn' });
      if (policy === 'careful' && s.night >= 3 && m % 120 === 100) ask(s, 'callum', 'nap');
    }
    step(s);
  }
  return s;
}

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [1, 2, 3]) {
  for (const policy of ['idle', 'trusting', 'careful', 'oracle'] as Policy[]) {
    const s = play(seed, policy);
    const rows = s.dawns.map((d) => {
      const flag = d.overtopped ? ' OVERTOP' : d.spilled ? ' spill' : '';
      return `N${d.night} L${d.maxLevel.toFixed(2)}${flag} B${d.maxBridge.toFixed(1)} ${d.mill[0]}${d.square[0]} miss ${d.misses.length}/${d.misses.filter((x) => x.caught).length} doze ${d.dozes.length}`;
    });
    console.log(
      `seed ${seed} ${policy.padEnd(8)} ${rows.join(' | ')}${s.dawns.length < NIGHTS ? ' (ended early)' : ''}`,
    );
    if (policy === 'trusting' && seed === (seeds[0] ?? 1)) {
      for (const d of s.dawns) {
        const lv = d.reports.filter((r) => r.gauge === 'level');
        console.log(
          `  N${d.night} level reads (said/true): ${lv
            .slice(0, 16)
            .map((r) => `${r.who[0]}${r.value.toFixed(1)}/${r.truth.toFixed(2)}${r.skipped ? 's' : ''}`)
            .join(' ')}`,
        );
        for (const l of d.lines) console.log(`  ${l.id}: ${l.line} | ${l.aboutYou}`);
      }
      const answers = s.said.filter((x) => x.kind === 'answer').map((x) => x.text);
      const counts = new Map<string, number>();
      for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
      console.log('  answers (last nights):', [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
    }
  }
}
