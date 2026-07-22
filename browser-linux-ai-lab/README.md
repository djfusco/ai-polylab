# Browser Linux AI Lab

A self-contained, disposable Linux environment that runs entirely inside the browser via WebAssembly, paired with an OpenAI-powered teaching assistant that gives contextual hints rather than answers.

---

## What This Demonstrates

**Browser-based Linux VM + AI teaching assistant.**

The lab presents a real Buildroot-compiled Linux kernel booting inside the browser via the v86 x86 emulator (compiled to WebAssembly). Students interact through a full xterm.js terminal. As they work, an AI assistant (powered by the OpenAI Responses API) monitors their command history and terminal output and offers tiered hints — from gentle nudges to direct guidance — on demand.

Key capabilities demonstrated:

- Running a Linux kernel and Busybox userland inside the browser with no server-side VM
- Intercepting xterm.js input to heuristically reconstruct shell commands (without a PTY)
- Formative evaluation of student work through evidence analysis (not a grade)
- Automatic hint detection when errors or repeated failed commands are detected
- Keeping secrets (the OpenAI API key) entirely server-side while remaining deployable to Vercel's free tier

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Client)                  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  Next.js App Router (React, TypeScript)      │   │
│  │                                              │   │
│  │  ┌───────────────────┐  ┌─────────────────┐ │   │
│  │  │  v86 WASM Engine  │  │  AI Assistant   │ │   │
│  │  │  ┌─────────────┐  │  │  Panel          │ │   │
│  │  │  │ Linux kernel│  │  │  (fetch →       │ │   │
│  │  │  │ + Buildroot │  │  │  /api/assistant)│ │   │
│  │  │  │ rootfs      │  │  └────────┬────────┘ │   │
│  │  │  └──────┬──────┘  │           │           │   │
│  │  │  serial0│ I/O     │           │           │   │
│  │  └─────────┼─────────┘           │           │   │
│  │            │                     │           │   │
│  │  ┌─────────▼──────────┐          │           │   │
│  │  │  xterm.js Terminal │          │           │   │
│  │  │  (renders output)  │          │           │   │
│  │  └────────────────────┘          │           │   │
│  │                                  │           │   │
│  │  TerminalBuffer  ←───────────────┘           │   │
│  │  (events, commands, transcript)              │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        │ HTTPS POST
          ┌─────────────▼──────────────┐
          │   Vercel (or any host)     │
          │                            │
          │   /api/assistant           │
          │   (Next.js Route Handler)  │
          │   ↳ validateRequest()      │
          │   ↳ OpenAI Responses API   │
          │     (OPENAI_API_KEY kept   │
          │      server-side only)     │
          └────────────────────────────┘
```

Static VM assets (`bzImage`, `rootfs.cpio.gz`, `v86.wasm`, BIOS files) are served
from `public/linux/v1/` as ordinary static files.  The browser fetches them once,
boots Linux, and never contacts the server again until the user requests an AI hint.

---

## Why Linux Runs in the Browser

The project uses [v86](https://github.com/copy/v86), an x86 PC emulator compiled to
WebAssembly (WASM).  The browser downloads:

1. `v86.wasm` — the emulator core (~2 MB)
2. `seabios.bin` / `vgabios.bin` — PC firmware blobs
3. `bzImage` — a real Linux kernel built with Buildroot (~3–5 MB)
4. `rootfs.cpio.gz` — the initial ramdisk with Busybox, xz-utils, and the lab dataset

WASM runs at near-native speed in a sandboxed environment.  The kernel boots in
5–15 seconds on a modern laptop; the emulated CPU executes real x86 instructions
inside the browser's JavaScript engine.  No server process is involved at any point
during VM execution.

The serial console (ttyS0) is bridged to xterm.js via v86's `serial0-output-byte`
event and `serial0_send()` method, so the terminal behaves like a standard Linux
serial console.

---

## Why Vercel Can Host This MVP

This project is structured as:

- **Static assets** (`public/`) — served by Vercel's CDN at no extra cost
- **One serverless function** (`app/api/assistant/route.ts`) — invoked only when the
  user requests an AI hint; completes in under 5 seconds

The VM never touches the server after the initial asset download.  A single Vercel
Hobby deployment handles hundreds of concurrent lab sessions because each session
is completely independent and client-side.

The only cost drivers are bandwidth (VM assets are ~15–25 MB per cold session) and
OpenAI API calls (typically 2–5 per lab session).

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ | Required by Next.js 15 |
| npm | 9+ | Bundled with Node.js 18 |
| Docker Desktop | Latest | macOS only, for Buildroot compilation |
| Git | Any | Clone the repository |

> **Docker is only needed to build the Linux VM assets.** If you use pre-built assets
> (or download them from a release), you do not need Docker to run the web app.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and add your OpenAI key
cp .env.example .env.local
#  → edit .env.local and set OPENAI_API_KEY=sk-...

# 3. Build the Linux VM assets (requires Docker, takes 20–40 min first time)
npm run build:linux && npm run copy:linux

# 4. Start the development server
npm run dev
```

Open http://localhost:3000.  The browser will download the VM assets and boot Linux.

---

## Buildroot Build Process

The VM assets are built inside a Docker container using
[Buildroot 2024.02 LTS](https://buildroot.org/downloads/manual/manual.html).

### What gets built

| File | Description |
|---|---|
| `bzImage` | Linux kernel (x86_32, ~3–5 MB) |
| `rootfs.cpio.gz` | Busybox userland + xz-utils + lab dataset |
| `v86.wasm` | Copied from the `v86` npm package |
| `seabios.bin` | SeaBIOS firmware (from v86 package) |
| `vgabios.bin` | VGA BIOS (from v86 package) |

### Build steps

```bash
# Full build inside Docker (first run downloads ~1 GB of sources)
npm run build:linux

# Copy compiled artifacts to public/linux/v1/
npm run copy:linux

# Verify all required files are present and non-zero
npm run check:linux

# Remove the Docker build cache (frees ~2 GB)
npm run clean:linux
```

### Buildroot configuration

The defconfig is at `linux-build/configs/browser_ai_lab_defconfig`.  It enables:

- `BR2_i386=y` — target architecture
- `BR2_LINUX_KERNEL=y` — build the kernel
- `BR2_PACKAGE_BUSYBOX=y` — Busybox utilities
- `BR2_PACKAGE_XZ=y` — xz-utils (required for the lab task)
- Custom post-build hook (`linux-build/board/browser-ai-lab/post-build.sh`) that
  generates the synthetic dispatch dataset and compresses it with xz

### Rootfs overlay

Files in `linux-build/board/browser-ai-lab/rootfs-overlay/` are merged into the
root filesystem before packing.  The overlay provides:

- `/etc/inittab` — boots to a serial console (ttyS0) as root
- `/etc/init.d/rcS` — minimal init script
- `/etc/hostname` — sets `lab` as the hostname
- `/root/.bash_profile` — displays the lab objective on login

---

## Running Locally

```bash
# Development server with hot reload
npm run dev

# Production build + local preview
npm run build
npm run start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

The dev server starts on port 3000 by default.

> **Performance note:** The Linux boot is noticeably faster in production builds
> because Next.js omits React Strict Mode's double-mount behaviour, which would
> otherwise create two emulator instances.

---

## OpenAI Configuration

The AI assistant requires an OpenAI API key with access to the `gpt-4o-mini` model
(or the model specified in `app/api/assistant/route.ts`).

```bash
# .env.local (never commit this file)
OPENAI_API_KEY=sk-proj-...
```

The key is read **only** in the API route handler.  It is never bundled into the
client-side JavaScript.  Next.js enforces this — any `NEXT_PUBLIC_` prefix would
be required to expose a variable to the browser, and this key has no such prefix.

### Changing the model

Open `app/api/assistant/route.ts` and update the `model` constant:

```typescript
const MODEL = 'gpt-4o-mini'; // change to 'gpt-4o', 'gpt-4-turbo', etc.
```

Faster/cheaper models (`gpt-4o-mini`) work well for hint generation.
Larger models (`gpt-4o`) produce more nuanced formative evaluations.

---

## Vercel Deployment Workflow

### First deployment

```bash
# Install the Vercel CLI (once)
npm install -g vercel

# Authenticate
vercel login

# Deploy to preview
vercel

# Promote to production
vercel --prod
```

### Adding the environment variable

In the Vercel dashboard:
1. Open your project → **Settings** → **Environment Variables**
2. Add `OPENAI_API_KEY` with your key value
3. Select **Production**, **Preview**, and **Development** environments
4. Redeploy for the variable to take effect

### Subsequent deployments

```bash
# Push to your linked Git repository (auto-deploys on push to main)
git push origin main

# Or trigger manually
vercel --prod
```

### Vercel configuration

`vercel.json` sets:
- `functions.app/api/assistant/route.ts.maxDuration: 30` — allows up to 30 s for
  the OpenAI call
- `headers` — adds `Cross-Origin-Embedder-Policy: require-corp` and
  `Cross-Origin-Opener-Policy: same-origin` on all routes, required for
  `SharedArrayBuffer` (used by v86's WASM threading model)

---

## Artifact Size Considerations

> **Important:** All files in `public/` are publicly downloadable by anyone with
> the URL.  Do not place secrets, private data, or unreleased content there.

Typical sizes after a Buildroot build:

| File | Typical size |
|---|---|
| `v86.wasm` | ~2.0 MB |
| `bzImage` | ~3.5 MB |
| `rootfs.cpio.gz` | ~2.5 MB |
| `seabios.bin` | ~128 KB |
| `vgabios.bin` | ~36 KB |
| **Total** | **~8–9 MB** |

Vercel's free tier allows 100 MB per deployment.  The assets fit comfortably.

For larger rootfs images (e.g. if you add many packages), consider:
- Moving assets to an S3-compatible object store (see the relevant section below)
- Enabling Vercel's Edge Cache headers for long-lived assets

---

## Browser Support

| Browser | Status |
|---|---|
| Chrome 90+ | ✅ Fully supported |
| Firefox 90+ | ✅ Fully supported |
| Edge 90+ | ✅ Fully supported (Chromium-based) |
| Safari 15.2+ | ⚠️ Supported; may be slower (JIT differences) |
| Mobile (iOS/Android) | 🧪 Experimental; keyboard handling issues |

The emulator requires:
- `WebAssembly` support
- `SharedArrayBuffer` (needs `Cross-Origin-Embedder-Policy` headers)
- Reasonably modern JavaScript JIT for acceptable performance

---

## Privacy Model

- **No tracking.** The application does not use analytics, cookies, or session
  storage beyond what the browser needs to run the app.
- **In-memory only.** All terminal output, command history, and session state live
  exclusively in JavaScript memory.  Nothing is written to disk, localStorage, or
  IndexedDB.
- **No server logging of terminal content.** The API route receives only a truncated
  excerpt of the transcript (max 12 000 characters) and the command history
  (max 20 entries) strictly for the purpose of generating a hint.
- **Session ends on page close.** Closing or refreshing the tab destroys the VM and
  all session data permanently.  There is no session persistence.
- **OpenAI data handling.** Transcript excerpts sent to the API route are forwarded
  to OpenAI.  Review OpenAI's [data usage policy](https://openai.com/policies/api-data-usage-policies)
  if deploying in an environment with data residency requirements.

---

## Security Model

| Concern | Mitigation |
|---|---|
| OpenAI API key exposure | Key is a server-side environment variable; never included in the client bundle |
| Prompt injection via terminal | The API route validates and size-limits all input before forwarding to OpenAI |
| XSS via terminal output | xterm.js renders output as text, not HTML; `dangerouslySetInnerHTML` is never used |
| WASM escape | v86 runs in the browser's WASM sandbox; the emulated Linux has no access to the host filesystem or network |
| Public asset exposure | `public/` files are intentionally public (VM images, BIOS blobs); no secrets are placed there |
| No one-click code execution | The AI assistant never automatically executes commands; suggestions are display-only |
| Oversized requests | `validateRequestSize()` rejects bodies over 50 000 bytes before JSON parsing |
| Rate limiting | No built-in rate limiting in this MVP; add Vercel's Rate Limiting add-on or an `upstash/ratelimit` middleware for production |

---

## Transcript Behavior

The terminal buffer (`lib/terminal-buffer.ts`) maintains an in-memory rolling window:

- **Events:** up to 2 000 (oldest dropped when exceeded)
- **Transcript:** up to 100 000 characters (oldest characters dropped)
- **Commands:** up to 50 most recent (oldest dropped)

When the user requests an AI hint, the most recent **12 000 characters** of transcript
and the most recent **20 commands** are sent to the API route.  This window is
intentionally narrow — it contains the context most relevant to the current moment.

The full transcript can be exported (if the export feature is enabled) as a JSON
file containing all events and assistant interactions from the session.

---

## Automatic Hints

The `AutomaticHintsController` (`lib/automatic-hints.ts`) watches terminal output
and triggers a hint prompt automatically under these conditions:

- **Error detected:** Output contains a phrase like `command not found`,
  `No such file or directory`, `Permission denied`, etc.
- **Repeated command:** The same command appears 3+ times in the last 5 commands
- **No visible progress:** 5+ commands issued without any progress indicator
  appearing in recent output

Gating conditions (all must pass before any trigger fires):

- `config.enabled` is `true`
- The user is not currently typing
- The browser tab is visible (`document.visibilityState === 'visible'`)
- At least `minIntervalMs` (default: 20 000 ms) has elapsed since the last hint

Automatic hints are **disabled by default** (`enabled: false` in
`DEFAULT_AUTO_HINT_CONFIG`).  Enable them by passing `{ enabled: true }` to the
`AutomaticHintsController` constructor or via the UI toggle.

---

## Formative Evaluation

When the user selects **Evaluate my work** mode, the AI assistant performs a
structured formative evaluation.  This is **not a grade** — it is feedback
intended to help the student reflect on their approach.

The evaluation is structured as a `FormativeEvaluation` object:

```typescript
interface FormativeEvaluation {
  taskCompletion?: string;   // Which tasks appear completed
  strengths?: string[];      // Effective strategies observed
  missteps?: string[];       // Commands that didn't work and why
  recovery?: string[];       // How the student recovered from errors
  verification?: string[];   // Whether results were verified
  efficiency?: string[];     // Opportunities to be more efficient
  nextPractice?: string[];   // Suggested follow-up exercises
}
```

The evidence analyzer (`lib/evidence-analyzer.ts`) examines command history to
detect which lab tasks have been attempted, and passes this evidence to the AI
to ground its evaluation in observable actions rather than guesses.

---

## Known Limitations

- **Boot time:** Linux takes 5–15 seconds to boot; this is inherent to the WASM
  emulator and cannot be reduced without switching to a faster emulator or
  reducing kernel size.
- **No network inside VM:** The emulated Linux has no networking.  All tools must
  be included in the rootfs at build time.
- **No persistent storage:** The VM ramdisk is reset on every page load.  There is
  no way to save work between sessions.
- **Command reconstruction is heuristic:** `CommandReconstructor` infers commands
  from xterm.js input events.  It handles common editing (backspace, arrow keys,
  Ctrl+C/U) but does not understand readline history substitution (`!!`, `!cmd`),
  alias expansion, or complex multi-line commands.
- **Safari performance:** Safari's WASM JIT is generally slower than V8/SpiderMonkey
  for this workload; expect 2–3× slower boot times.
- **Mobile keyboards:** On-screen keyboards send non-standard key events that may
  not be handled correctly by xterm.js.
- **No copy/paste on iOS:** iOS restricts clipboard access in ways that break
  xterm.js's paste handling.
- **Single session per tab:** Each browser tab runs one VM instance.  Multiple tabs
  each boot their own independent VMs.

---

## How to Reset the VM

The user can reset (reboot) the running VM by clicking the **Reset** button in the
status bar.  This calls `emulator.restart()` on the v86 instance.

Internally the React component holds the emulator in a ref.  Calling `restart()`
reboots the emulated machine from scratch without reloading the page, which avoids
re-downloading the WASM and kernel assets.

After reset, `TerminalBuffer.clear()` is called to wipe the session state.

---

## How to Add Another Lab

1. **Add a new rootfs overlay** under `linux-build/board/browser-ai-lab/rootfs-overlay/`
   with any additional files your lab needs (datasets, scripts, etc.).

2. **Edit the post-build hook** (`linux-build/board/browser-ai-lab/post-build.sh`)
   to generate your lab's dataset and place it in the expected location.

3. **Update the objective text** in the Next.js page component to describe the new
   lab tasks.

4. **Update the evidence analyzer** (`lib/evidence-analyzer.ts`) to detect
   commands and output patterns relevant to the new lab.

5. **Rebuild:** `npm run build:linux && npm run copy:linux`

For multi-lab deployments, consider versioning the assets directory
(`/linux/v2/`, `/linux/v3/`, etc.) and reading the manifest URL from a query
parameter or environment variable.

---

## How to Replace the Sample Dataset

The dispatch dataset is generated by
`linux-build/board/browser-ai-lab/generate-lab-data.sh`.

To replace it:

1. Edit `generate-lab-data.sh` to produce your desired TSV content.
2. Ensure the output file is written to `$TARGET/root/lab/dispatch.bin` and is
   compressed with `xz` (the lab tasks assume xz compression).
3. Update the objective text in the React page to match your new dataset context.
4. Rebuild the rootfs: `npm run build:linux && npm run copy:linux`

---

## How to Add a Buildroot Package

1. Open `linux-build/configs/browser_ai_lab_defconfig`.
2. Add the package's `BR2_PACKAGE_<NAME>=y` symbol.
3. If the package requires a specific kernel option, add it under
   `BR2_LINUX_KERNEL_CONFIG_FRAGMENT_FILES` or in a kernel fragment file.
4. Rebuild: `npm run build:linux`

Find available package symbols in Buildroot's documentation or by running
`make menuconfig` inside the Docker container:

```bash
docker run --rm -it -v "$(pwd)/linux-build:/build" \
  buildroot/buildroot:2024.02 \
  bash -c "cd /build && make -C /build menuconfig"
```

---

## How to Change the OpenAI Model

Open `app/api/assistant/route.ts` and update the `MODEL` constant:

```typescript
const MODEL = 'gpt-4o-mini'; // ← change this
```

Supported values include `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`, and any other
model available via the OpenAI Responses API at the time of deployment.

The `instructions` and `input` structure passed to `client.responses.create()`
is model-agnostic and does not need to change when switching models.

---

## How to Move VM Assets to Object Storage

By default, VM assets are served from `public/linux/v1/`.  For large rootfs images
or high-traffic deployments, you may want to serve assets from an S3-compatible
object store (e.g. AWS S3, Cloudflare R2, or DigitalOcean Spaces).

1. Upload the compiled assets to your bucket with `public-read` ACL.

2. Update `public/linux/v1/manifest.json` to point to the new URLs:

   ```json
   {
     "version": "v1",
     "kernel": "https://my-bucket.s3.amazonaws.com/linux/v1/bzImage",
     "filesystem": "https://my-bucket.s3.amazonaws.com/linux/v1/rootfs.cpio.gz",
     "wasm": "https://my-bucket.s3.amazonaws.com/linux/v1/v86.wasm",
     "bios": "https://my-bucket.s3.amazonaws.com/linux/v1/seabios.bin",
     "vgaBios": "https://my-bucket.s3.amazonaws.com/linux/v1/vgabios.bin"
   }
   ```

3. Ensure the bucket's CORS policy allows `GET` requests from your deployment domain.

4. The `V86Controller` uses the manifest URLs directly, so no code changes are needed.

> **Note:** v86's WASM requires `SharedArrayBuffer`, which requires
> `Cross-Origin-Embedder-Policy: require-corp` headers.  Your object storage must
> serve asset files with a `Cross-Origin-Resource-Policy: cross-origin` header,
> otherwise the browser will block the fetch.  Alternatively, proxy the assets
> through Next.js rewrites.

---

## Troubleshooting

### The terminal stays blank after boot

- Open DevTools → Console.  If you see a CORS error for any `/linux/v1/` file, the
  server is not sending the required `Cross-Origin-Embedder-Policy` header.  Check
  `vercel.json` or your custom server configuration.
- If you see `SharedArrayBuffer is not defined`, the COOP/COEP headers are missing.
- If assets return 404, run `npm run check:linux` to verify all files exist in
  `public/linux/v1/`.

### "VM assets not found" error on the page

Run `npm run check:linux`.  If any file is missing, run
`npm run build:linux && npm run copy:linux` to rebuild.

### Linux boots but hangs at a kernel panic

The kernel expects `/sbin/init` to exist in the rootfs.  If the rootfs build failed
partially, the file may be missing.  Rebuild with `npm run build:linux`.

### The AI assistant returns "OpenAI API key not configured"

- Ensure `OPENAI_API_KEY` is set in `.env.local` (local) or in Vercel's environment
  variable settings (deployed).
- The variable must **not** have the `NEXT_PUBLIC_` prefix.
- Restart the dev server (`npm run dev`) after editing `.env.local`.

### The AI assistant returns 500 Internal Server Error

- Check the server logs (`vercel logs <project>` or the terminal running `npm run dev`).
- A common cause is an invalid or expired API key.
- Another cause is the OpenAI request timing out; the `maxDuration` in `vercel.json`
  must be at least 30 seconds.

### npm run build:linux fails immediately

- Ensure Docker Desktop is running.
- On Apple Silicon Macs, Docker may need `--platform linux/amd64` set.  The
  `linux-build/Dockerfile` handles this automatically, but verify Docker Desktop
  has Rosetta 2 enabled under **Settings → General → Use Rosetta for x86/amd64
  emulation**.

### The build takes more than an hour

The first Buildroot build downloads sources from the internet and compiles them.
Subsequent builds use a Docker layer cache and take 2–5 minutes.  If the build is
slow every time, Docker's layer cache may not be persisting — check your Docker
Desktop storage settings.

### Tests fail with "Cannot find module '../lib/...'"

Run `npm install` to ensure all devDependencies (including `vitest`) are installed.
TypeScript paths are configured in `vitest.config.ts` and `tsconfig.json`.

### xterm.js flickers or shows garbled output on resize

Call `fitAddon.fit()` inside a `ResizeObserver` callback rather than a window
`resize` event.  The `LinuxTerminal` component handles this automatically, but
custom integrations should follow the same pattern.

### Keyboard input is not reaching the VM

Ensure the xterm.js `Terminal` instance has focus (`terminal.focus()`).  Click
directly on the terminal area.  The `onData` handler that calls
`emulator.serial0_send()` is only active when the terminal has focus.
