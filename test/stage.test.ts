// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { watchStage } from '../src/ui/stage.ts';

it('measures the real scene, publishes host sheets and removes its resize listener on teardown', () => {
  document.body.innerHTML =
    '<div class="watch lk-stage"><button id="origin">Level</button><canvas class="lk-scene"></canvas><div class="lk-sheet"></div></div>';
  const root = document.querySelector<HTMLElement>('.watch')!;
  const canvas = root.querySelector('canvas')!;
  const rect = { x: 12, y: 30, width: 336, height: 118 };
  vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(() => ({
    ...rect,
    top: rect.y,
    left: rect.x,
    bottom: rect.y + rect.height,
    right: rect.x + rect.width,
    toJSON() {},
  }));
  const origin = document.getElementById('origin')!;
  origin.focus();
  const previousHistory = history.length;
  const draw = vi.fn();
  const stage = watchStage(root, draw);
  expect(draw).toHaveBeenLastCalledWith(rect);
  stage.sheet('gauge-level-dai');
  expect(root.dataset.sheetId).toBe('gauge-level-dai');
  expect(root.dataset.sheet).toBe('fit');
  expect(document.activeElement).toBe(origin);
  expect(history.length).toBe(previousHistory);
  rect.width = 780;
  window.dispatchEvent(new Event('resize'));
  expect(draw).toHaveBeenLastCalledWith(rect);
  stage.sheet(null);
  expect(root.dataset.sheetId).toBeUndefined();
  expect(root.dataset.sheet).toBe('closed');
  stage.destroy();
  draw.mockClear();
  window.dispatchEvent(new Event('resize'));
  expect(draw).not.toHaveBeenCalled();
  root.remove();
});
