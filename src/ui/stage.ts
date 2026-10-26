import { phoneStage, type SceneRect } from '@adam0white/lab-kit';

/** The host owns layout and navigation. The kit measures the real drawing surface. */
export function watchStage(root: HTMLElement, redraw: (rect: Readonly<SceneRect>) => void) {
  const controller = phoneStage(root, {
    observeOnly: true,
    history: false,
    onSceneRect: redraw,
  });
  return {
    sheet(id: string | null) {
      root.dataset.sheet = id ? 'fit' : 'closed';
      if (id) root.dataset.sheetId = id;
      else delete root.dataset.sheetId;
      root.dataset.sheetBack = 'false';
      controller.refresh();
    },
    destroy: () => controller.destroy(),
  };
}
