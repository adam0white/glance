import type { WatchRules } from '../sim/dam.ts';

export function durationWords(extended: boolean): string {
  return extended
    ? "You work twelve nights, through the weekend and a second week. The watch ends at the second Friday's first light, or when water comes over the top of the dam."
    : "You work five nights, Monday to Friday. The week ends at Friday's first light, or when water comes over the top of the dam.";
}
export function catchWords(edition?: WatchRules['edition']): string {
  return edition === 'extended-1'
    ? 'In this saved longer watch, a wrong reading counts as caught when you marked that report as doubted. Rereads and lightning do not add catch credit in this edition.'
    : 'A wrong reading counts as caught when you had it read again within twenty minutes, or lightning showed the wall within twenty minutes.' +
        (edition === 'extended-2' ? ' Marking that report as doubted also counts.' : '');
}
