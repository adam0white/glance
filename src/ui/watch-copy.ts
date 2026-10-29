import type { WatchRules } from '../sim/dam.ts';

export function durationWords(extended: boolean): string {
  return extended
    ? "You work twelve nights, through the weekend and a second week. The watch ends at the second Friday's first light, or when water comes over the top of the dam."
    : "You work five nights, Monday to Friday. The week ends at Friday's first light, or when water comes over the top of the dam.";
}
export function catchWords(_edition?: WatchRules['edition']): string {
  return 'A wrong reading counts as caught when you had it read again within twenty minutes, lightning showed the wall within twenty minutes, or you marked that report as doubted.';
}
