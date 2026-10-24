import { canonicalPersona } from '@adam0white/lab-client';
import { exportRun, GAME_VERSION, type GameState, replay } from './dam.ts';
export const exportCurrent = (s: GameState) => exportRun(s, '2.18.0');
export function importCurrent(value: unknown): GameState {
  const ex = value as ReturnType<typeof exportCurrent>;
  if (ex.game !== GAME_VERSION || ex.state?.version !== GAME_VERSION || !Array.isArray(ex.inputs))
    throw new Error('Unsupported edition. Start fresh.');
  const s = replay(ex.seed, ex.inputs, ex.state.minute, ex.state.chapter ?? undefined);
  if (canonicalPersona(exportCurrent(s).state) !== canonicalPersona(ex.state))
    throw new Error('Current replay differs from pinned export.');
  return s;
}
