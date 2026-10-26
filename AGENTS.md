# Glance

Use [the plain-English policy](docs/lab/plain-english.md) for player-facing text.
Preserve the gauge, weather, dam, keeper and replay rules. Reports remain uncertain. Written times remain as written.
Technical completion means reviewed source, signed commits, exact green CI, fresh deployment, a clean matching release manifest and live Chromium/WebKit checks at all four required sizes. Adam accepts feel and readiness separately. Friends' playtests and Show HN remain paused until he accepts readiness. HF3 lab-panel rounds are allowed under the playtest director; documentation workers run no rounds. Preserve any narrower limits in a delivery report; bounded technical evidence does not establish owner acceptance.

Current source pins HF package 3.0.0 (engine 2.23.0), lab-client 0.4.11 and lab-kit 0.5.12. TypeScript support is 7+. Keep lab SDKs as immutable artifacts; a newer release does not establish host adoption.

Use shared Node 26.12.0 from `.node-version` / `.nvmrc` and the exact pnpm 12.14.0 package-manager pin. Install with `pnpm install --frozen-lockfile`; keep `pnpm-lock.yaml`. Keep npm overrides and native build permissions in `pnpm-workspace.yaml`, not package metadata. `npm run` remains valid for scripts. The installer conversion requires reviewed source, full lane, byte-identical raw build outputs, signed commit and exact green CI; it does not deploy the app or establish game readiness.
