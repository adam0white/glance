import { createLab } from '@adam0white/lab-client';

import { fileEntry } from '../continuity.ts';

// Resolve the host route before SDK or app startup. SDK11 preservation remains a separate gate.
export const entryMode = fileEntry(location.search);

export const lab = createLab({ game: 'glance' });
