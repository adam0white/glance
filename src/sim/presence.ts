/** SCOPE: physical presence only. No staffing, appetite, permission or HF choice
 * is inferred from a clock change or a stored scene result. */
import type { GameState } from './dam.ts';
import { callumAway } from './keeper-scenes.ts';
import { rotaAway } from './rota.ts';
export function physicallyAway(s: GameState, id: string): boolean {
  if (rotaAway(s, id)) return true;
  if (id === 'dai' && s.outcomes?.keeperScenes?.away !== undefined) return true;
  if (id === 'callum' && callumAway(s)) return true;
  if (id === 'nerys') return s.viewing?.away === true || s.privateScenes?.active?.action === 'telescope';
  return false;
}
export function innUnavailable(s: GameState): boolean {
  const p = s.people.find((p) => p.id === 'nerys');
  return !p || physicallyAway(s, 'nerys') || p.body.asleep || p.activity?.mode === 'sleep';
}
