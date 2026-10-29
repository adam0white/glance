/** Current HF readings, expressed in broad words. Never a gauge accuracy estimate. */
import type { Person } from '../sim/actor-view.ts';

export function liveWords(person: Person): string[] {
  const { affect, condition, expectations, needs } = person.readings;
  const signs = condition.outwardSigns;
  const words = [
    `Visible condition: ${signs.fatigue > 0.65 ? 'very tired' : signs.fatigue > 0.35 ? 'tired' : 'no clear sign of tiredness'}${signs.pain > 0.35 ? '; showing pain' : ''}${signs.fear > 0.35 ? '; showing fear' : ''}.`,
    `Mood: ${affect.mood.valence < -0.25 ? 'low' : affect.mood.valence > 0.25 ? 'positive' : 'steady'}; ${affect.mood.arousal > 0.65 ? 'alert' : affect.mood.arousal < 0.25 ? 'quiet' : 'settled'}.`,
  ];
  const feelings = affect.emotions.filter((e) => e.intensity > 0.2);
  if (feelings.length) words.push(`Feelings: ${feelings.map((e) => e.id).join(', ')}.`);
  const pressing = needs.filter((n) => n.urgency > 0.25);
  words.push(
    pressing.length ? `Pressing needs: ${pressing.map((n) => n.id).join(', ')}.` : 'No need is pressing.',
  );
  if (expectations.length) {
    const successful = expectations.every((e) => e.successRate >= 0.7);
    const unsuccessful = expectations.every((e) => e.successRate < 0.4);
    words.push(
      `Experience: ${successful ? 'familiar actions have usually worked' : unsuccessful ? 'familiar actions have often fallen short' : 'familiar actions have had mixed results'}. Past outcomes do not guarantee the next result.`,
    );
  } else words.push('Experience: no learned action outcomes yet.');
  return words;
}
