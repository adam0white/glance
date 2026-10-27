import { createLab } from '@adam0white/lab-client';

import { fileEntry } from '../continuity.ts';

// Resolve file and invalid routes before any SDK initialization.
export const entryMode = fileEntry(location.search);

export const lab = createLab({
  game: 'glance',
  ...(entryMode !== 'native' ? { preservation: 'preserve' as const } : {}),
});
