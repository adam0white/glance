/** SCOPE: the worker owns its candidate and then the live Run. The page receives
 * only inspections and complete native bytes; it never reconstructs a Person. */

import { admitFile, admitNative, admitPublic, type FileContext, safeFile } from './file-admission.ts';
import { cloneState, type GameState, newGame, planOf, queueInput, restoreState, step } from './sim/dam.ts';
import type { InspectionPacket } from './sim/display.ts';
import { bodyForecast, predict, readPerson } from './sim/hf4.ts';
import { validateChapter } from './sim/passport.ts';
import { practiceNight } from './sim/practice.ts';
import { exportCurrent, importCurrent } from './sim/run.ts';
export function watchOwner(emit: (value: unknown) => void) {
  let state: GameState | undefined;
  let revision = 0;
  let file: FileContext | undefined;
  let native: Awaited<ReturnType<typeof admitNative>> | undefined;
  function packet(): InspectionPacket {
    if (!state) throw Error('No watch is held.');
    return {
      full: exportCurrent(state),
      host: (({ people: _people, ...host }) => structuredClone(host))(state),
      people: state.people.map((p) => structuredClone(p)),
      bodies: state.people.map((p) => readPerson(p).body),
    };
  }
  return async (message: { id: number; kind: string; value?: any }) => {
    const { id, kind, value } = message;
    try {
      if (['load', 'create', 'file', 'native'].includes(kind)) {
        emit({ id, kind: 'progress', message: 'Checking the complete saved watch…' });
        if (kind === 'file') {
          const admitted = await admitFile(value);
          state = admitted.state;
          file = admitted.context;
        } else if (kind === 'native') {
          native = await admitNative(value);
          state = native.state;
        } else {
          if (kind === 'create') await validateChapter(value.chapter);
          state =
            kind === 'load'
              ? (await admitPublic(value)).state
              : newGame(value.seed, value.chapter, value.rules);
        }
        emit({
          id,
          kind: 'accepted',
          revision,
          packet: packet(),
          file,
          native: native
            ? {
                runId: native.runId,
                fileOrigin: native.fileOrigin,
                heads: native.heads,
                sources: native.sources,
                preparation: native.preparation,
              }
            : undefined,
        });
        return;
      }
      if (!state) throw Error('No watch is held.');
      if (kind === 'preview') {
        if (value.basis !== revision) throw Error('That forecast belongs to an earlier moment.');
        const p = state.people.find((p) => p.id === value.person);
        if (!p) throw Error('Unknown person.');
        const result =
          value.kind === 'decision'
            ? predict(p, value.payload.affordances, value.payload.suggestion)
            : bodyForecast(p, value.payload);
        emit({ id, kind: 'preview', revision, value: result });
        return;
      }
      if (kind === 'practice') {
        const branch = practiceNight(state, value.turns);
        emit({ id, kind: 'practice', dawn: branch.dawns.at(-1), crew: planOf(branch).keepers.length > 1 });
        return;
      }
      if (kind !== 'mutate') throw Error('Unknown watch action.');
      const previous = file ? cloneState(state) : undefined;
      if (value.input) queueInput(state, value.input);
      for (let n = 0; n < (value.minutes ?? 0) && state.phase === 'watch'; n++) step(state);
      const next = packet();
      if (file)
        try {
          const { castSources, ...context } = file;
          safeFile(JSON.stringify({ ...context, current: { ...next.full, castSources } }));
        } catch (error) {
          emit({ id, kind: 'progress', message: 'Keeping the current file unchanged…' });
          state = restoreState(previous!);
          throw error;
        }
      revision++;
      emit({ id, kind: 'accepted', revision, packet: next });
    } catch (error) {
      emit({
        id,
        kind: 'refused',
        message: error instanceof Error ? error.message : 'The watch could not be checked.',
      });
    }
  };
}
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const receive = watchOwner((value) => self.postMessage(value));
  self.onmessage = (event) => receive(event.data);
}
