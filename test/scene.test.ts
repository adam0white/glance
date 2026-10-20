import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/dam.ts';
import { sceneHit } from '../src/ui/scene.ts';

describe('scene selection in the space left above the responses', () => {
  it('maps a dam tap correctly when the scene shrinks vertically', () => {
    const run = newGame(7);
    // The 360×236 drawing fits at half size, centred in a 336×118 canvas.
    expect(sceneHit(run, 78 + 100 * 0.5, 100 * 0.5, 336, 118)).toBe('dam');
    expect(sceneHit(run, 10, 50, 336, 118)).toBeNull();
  });
});
