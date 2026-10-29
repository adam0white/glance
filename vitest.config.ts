import { defineConfig } from 'vitest/config';

// GAME test-process concurrency only. Every test keeps its normal deadline.
export default defineConfig({ test: { maxWorkers: 1 } });
