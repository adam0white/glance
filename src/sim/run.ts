import { canonicalPersona } from '@adam0white/lab-client';
import { exportRun, GAME_VERSION, type GameState, replay } from './dam.ts';
import { FRAMEWORK_VERSION } from './hf4.ts';
export const exportCurrent = (s: GameState) => exportRun(s, FRAMEWORK_VERSION);
export function importCurrent(value: unknown): GameState {
  const ex = value as ReturnType<typeof exportCurrent>;
  if (
    ex.framework !== FRAMEWORK_VERSION ||
    ex.game !== GAME_VERSION ||
    ex.state?.version !== GAME_VERSION ||
    !Array.isArray(ex.inputs)
  )
    throw new Error(
      'This saved watch uses an older or unsupported version. Keep the file. Start a new game to use the current version.',
    );
  const s = replay(
    ex.seed,
    ex.inputs,
    ex.state.minute,
    ex.state.chapter ?? undefined,
    ex.state.rules,
    ex.state.applied,
  );
  if (canonicalPersona(exportCurrent(s).state) !== canonicalPersona(ex.state))
    throw new Error(
      'This file does not replay the same way in this version of The Glance. It may come from an older version. The file was not loaded. Start a new game.',
    );
  return s;
}
