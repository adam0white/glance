import { canonicalPersona } from '@adam0white/lab-client';
import { exportRun, GAME_VERSION, type GameState, replay } from './dam.ts';
export const exportCurrent = (s: GameState) => exportRun(s, '2.21.0');
export function importCurrent(value: unknown): GameState {
  const ex = value as ReturnType<typeof exportCurrent>;
  if (
    ex.framework !== '2.21.0' ||
    ex.game !== GAME_VERSION ||
    ex.state?.version !== GAME_VERSION ||
    !Array.isArray(ex.inputs)
  )
    throw new Error('This file is from a different version of The Glance. Start a new game.');
  const s = replay(ex.seed, ex.inputs, ex.state.minute, ex.state.chapter ?? undefined);
  if (canonicalPersona(exportCurrent(s).state) !== canonicalPersona(ex.state))
    throw new Error(
      'This file does not replay the same way in this version of The Glance. It may come from an older version. The file was not loaded. Start a new game.',
    );
  return s;
}
