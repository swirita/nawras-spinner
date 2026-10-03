# Nawras Spinner cleanup measurements

Measured on the same local production preview, installed headless Chrome, and 1440 × 900 viewport. The saved-data schema and model implementation are unchanged. Benchmark contexts use isolated localStorage and do not access the user's normal browser data.

The editing scenario uses 8 and 100 entries, with five batches of 40 synchronous title, URL, and label input events. Each batch paints before the next; reported times are the median of the five batches. A MutationObserver counts additions within the editor wheel. The same script ran before and after implementation, with no other browser suites running concurrently.

| Measurement | Before | After |
| --- | ---: | ---: |
| 8 entries: median time per 40 edits | 20.8 ms | 3.5 ms |
| 100 entries: median time per 40 edits | 46.5 ms | 10.6 ms |
| Complete SVG rebuilds across 200 edits, either size | 200 | 0 |
| Added wheel nodes, 8 entries | 17,600 | 60 |
| Added wheel nodes, 100 entries | 89,600 | 60 |
| Timer left after interrupting the replay fade | 1 | 0 |
| Production CSS, gzip (Vite build output) | 7.25 kB | 6.27 kB |

Editing batch time fell by approximately 83% for 8 entries and 77% for 100 entries in this scenario. These measurements describe this machine and workload, not a guarantee for every device. Changes that alter geometry or color still rebuild the affected wheel. Normalized SVG geometry adapts to CSS dimensions without rebuilding paths.

The normal 6.048-second spin had no animation-frame gaps over 50 ms in either comparison. Its sampled 95th-percentile gap was 13.9 ms before and 7.1 ms after. Single-spin headless scheduling varies, so these samples do not establish a consistent framerate improvement. Main-thread task time was 2,151.8 ms before and 1,922.1 ms after; script time was 103.2 ms before and 116.1 ms after. The primary repeatable improvement is eliminating editor rebuilds, rather than claiming all spin metrics improved.

The resource scenario warms the AudioContext and dialog once, then completes 12 reduced-motion spins with editor/presentation transitions, followed by a normal spin, an interrupted replay fade, and an interrupted spin. Garbage collection runs before DOM/listener snapshots. Before/after counts within the cleaned implementation stayed at 169 DOM nodes and 29 listeners through all 12 cycles, with one shared AudioContext. After each tested exit there were zero pending scene timers, animation frames, active audio voices, celebration particles, or screen-specific running animations. Five persistent background particle animations remain on visible idle screens; they pause while spinning or hidden. The original implementation also had stable cycle counts after warmup; no listener leak is claimed for it.

## Changes and retained files

- Reuse per-container wheel views through a WeakMap, retaining slice geometry, gradients, and normalized coordinates. Compute contrast/reflection once per distinct color when building a wheel. Update changed labels and links without rebuilding its paths, and reuse those sections for chance calculations and boundary ticks.
- Reuse the presentation wheel between rounds. Remove the redundant draw before replay and cancel completed Web Animation effects before updating the landed angle.
- Use one set of dialog event handlers and one confirmation callback. Clear closed dialog contents and cancel screen-bound timers, frames, celebration nodes, and sounds on exit. Clear deleted wheels' scroll-state entries.
- Consolidate styles in their original order, removing superseded declarations, obsolete hub/heading/sparkle rules, and unused celebration keyframes. Keep the glass reflection, centered header, circular logo, winner glow/fountain, notification dismissal, reduced motion, and contained editor scrolling.
- Remove `src/polish.css`, `src/editor-layout.css`, `src/frosted.css`, `src/winner-footer.css`, and `src/notification.css` after incorporating their active rules into `src/style.css` and removing their imports. Historical scripts in the ignored `.checks` directory are left intact.
- Retain all four original PNG logo assets, including the unused light branding variant, as documented brand sources. Retain Vite configuration, the dependency lockfile, and both dependencies: Vite is the build/preview tool, and Playwright runs the existing browser checks. Preserve existing audio, notification, and saved-data work.

## Verification

Production build and all 10 unit tests passed. The general browser, layout/polish, presentation, winners, and audio suites passed. They cover weighted pointer accuracy, 6.048-second guarded spins, autosave, undo/redo, JSON import/export, malformed-storage protection, session-only winner exclusions, reset, history recording and persistence, responsive overlay controls, delayed reveal, bottom-center fountain, fade-before-replay, and reduced motion. Layout checks scroll the final entry into view at 320 × 568 and 390 × 450, as well as larger viewports. Desktop/editor and winner screenshots were also visually inspected.

The audio suite checks every emitted tick against a rendered weighted boundary, with alternating nonoverlapping tones and no catch-up burst after a 220 ms main-thread stall. The audio unit test verifies the exponential envelope, cancellation gain at onset/mid-decay/tail, oscillator cleanup, mute, and unchanged winner pitches, slides, delays, and durations. The final performance/resource checks passed with `PERF_ASSERT=1`.

The color-specific browser suite did not run because its Chrome execution request was rejected by the user. Color migration, ID stability, transfer, and contrast unit tests passed. No push or deployment was performed.
