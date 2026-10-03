# Nawras Spinner

A static, offline-friendly wheel app for NawrasEdu events, built with Vite and vanilla JavaScript. Original logos are preserved in `public/assets/`.

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates `dist/`; `npm run preview` serves the production build. `npm test` checks data validation and weighted landing geometry. With the dev server running, `npm run test:browser` checks the main flows and writes screenshots to `.checks/`. Browser checks use installed Chrome on Windows; set `CHROME_PATH` to override, or install Playwright Chromium on other platforms. Set `CHECK_URL` to test a different URL, including a production preview.

My Wheels supports create, duplicate, delete, JSON export and import. The editor autosaves each wheel, supports undo/redo for the current session, multiline paste, positive decimal weights, optional HTTP/HTTPS links, and automatic winner removal. All options appear in one continuous list with a thin scrollbar and contained scrolling. The editor fits the viewport on desktop and smaller screens; its title, history toolbar and bottom actions remain visible outside the scrolling entries region. Adding an option scrolls its input into view and focuses it. Audience View has weighted spinning and a full-screen black winner reveal. Controls appear after a one-second pause; Escape dismisses the reveal and restores focus. Press F in Audience View to toggle fullscreen (ignored while typing). Empty labels display as “Untitled option.” Blank lines in pasted lists are skipped. Labels shrink or disappear on dense wheels; names are never abbreviated and winner text is always complete. Decorative wheel layers do not intercept slice links. The circular logo in `public/assets/nawras-circle.png` is displayed with its original proportions and transparency and without an added CSS frame. Header logos are centered relative to the viewport, independently of side controls.

With a production preview running on port 4173, `npm run test:polish` checks desktop and mobile viewport fit, continuous entry scrolling, fullscreen shortcuts, winner layout and focus, mobile layout, links, and weighted pointer accuracy. Override `CHECK_URL` if the preview uses another port. Both browser suites run in isolated browser contexts and do not modify your regular browser's saved wheels.

Wheels use versioned localStorage (`nawras-spinner:v1`). Localhost and a deployed site have separate storage: export JSON locally and import it on the deployed site. Import assigns new IDs. Invalid enabled URLs are kept editable locally but rejected on import until fixed or disabled. Unreadable storage is left untouched and saving is paused; export new work before closing that tab. Storage failures show a warning. An external storage change pauses saving to prevent another tab's work being overwritten. The editable example is created only when the storage key has never existed; deleting it leaves an empty saved library.

Navigation uses hashes, so direct screen refreshes work on GitHub Pages. The default Vite base is `./`. For a repository path, set `VITE_BASE_PATH=/repository-name/` when building (PowerShell: `$env:VITE_BASE_PATH='/repository-name/'; npm run build`). Asset paths use Vite's base. No repository was initialized and no push or deployment is included. Configure GitHub Actions in the next stage.

No backend, accounts, analytics, external fonts or paid services. Fullscreen depends on browser support. Optional links open only when clicked, with `noopener noreferrer`.
