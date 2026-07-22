// ============================================================
// V86Controller — manages the lifecycle of the v86 x86 emulator
//
// Usage (browser-only):
//   const controller = createV86Controller(options);
//   await controller.init();
//   controller.sendInput('ls -la\n');
//   controller.destroy();
// ============================================================

import type {
  V86ControllerOptions,
  V86Instance,
} from './v86-types';

// ------------------------------------------------------------------
// Internal constants
// ------------------------------------------------------------------

/** Patterns that indicate the Linux shell is ready for input. */
const BOOT_COMPLETE_PATTERNS = [
  /student@ailab/,
  /\$\s*$/m,
  /# $/m,
];

/**
 * Maximum number of bytes to accumulate before flushing to
 * onSerialOutput even if no newline has been seen.
 */
const FLUSH_BYTE_COUNT = 256;

/** Time in ms to wait before flushing a partial line. */
const FLUSH_TIMEOUT_MS = 50;

// ------------------------------------------------------------------
// V86Controller
// ------------------------------------------------------------------

export class V86Controller {
  private emulator: V86Instance | null = null;
  private initialized = false;
  private destroyed = false;
  private options: V86ControllerOptions;

  // Byte accumulation buffer and flush timer
  private outputBuffer = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Stable handler references so we can remove them later
  private outputByteHandler: (...args: unknown[]) => void;
  private readyHandler: () => void;
  private startedHandler: () => void;
  private stoppedHandler: () => void;
  private downloadProgressHandler: (...args: unknown[]) => void;
  private downloadErrorHandler: (...args: unknown[]) => void;

  // Boot detection
  private bootDetected = false;

  constructor(options: V86ControllerOptions) {
    this.options = options;

    // Build stable handler closures once so they can be removed later.
    this.outputByteHandler = (...args: unknown[]) => {
      this._handleOutputByte(args[0] as number);
    };

    this.readyHandler = () => {
      // 'emulator-ready' fires when BIOS/kernel handoff completes.
      // Linux is still booting — update status to 'booting'.
      this.options.onStatus('booting');
    };

    this.startedHandler = () => {
      // 'emulator-started' fires when the virtual CPU starts executing.
      // Linux still hasn't reached the shell prompt yet.
      this.options.onStatus('booting');
    };

    this.stoppedHandler = () => {
      if (!this.destroyed) {
        this.options.onStatus('stopped');
      }
    };

    this.downloadProgressHandler = (...args: unknown[]) => {
      if (this.options.onDownloadProgress) {
        // v86 emits download-progress as (loaded, total, fileName) or as
        // a progress object — handle both shapes defensively.
        if (
          typeof args[0] === 'number' &&
          typeof args[1] === 'number' &&
          typeof args[2] === 'string'
        ) {
          this.options.onDownloadProgress(args[0], args[1], args[2]);
        } else if (args[0] && typeof args[0] === 'object') {
          const p = args[0] as Record<string, unknown>;
          const loaded = typeof p.loaded === 'number' ? p.loaded : 0;
          const total = typeof p.total === 'number' ? p.total : 0;
          const file = typeof p.file_name === 'string' ? p.file_name : '';
          this.options.onDownloadProgress(loaded, total, file);
        }
      }
    };

    this.downloadErrorHandler = (...args: unknown[]) => {
      const msg =
        args[0] instanceof Error
          ? args[0].message
          : typeof args[0] === 'string'
          ? args[0]
          : 'Download failed';
      this.options.onStatus('error');
      this.options.onError(new Error(msg));
    };
  }

  // ----------------------------------------------------------------
  // init — dynamically imports v86 and creates the emulator
  // Guard against double-init (React Strict Mode double-mount).
  // ----------------------------------------------------------------

  async init(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('V86Controller must be initialised in a browser context');
    }
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.options.onStatus('loading-assets');

      // Load libv86.js via a <script> tag at runtime.
      // This avoids webpack bundling v86 (which uses node:crypto internally).
      await this._loadV86Script();

      const V86Class = (window as unknown as Record<string, unknown>)['V86'] as
        | (new (...a: unknown[]) => V86Instance)
        | undefined;

      if (!V86Class) {
        throw new Error(
          'V86 constructor not found on window after loading libv86.js'
        );
      }

      const { manifest } = this.options;

      this.emulator = new V86Class({
        wasm_path: manifest.wasm,
        bios: { url: manifest.bios },
        vga_bios: { url: manifest.vgaBios },
        bzimage: { url: manifest.kernel },
        initrd: { url: manifest.filesystem },
        cmdline:
          'console=ttyS0,115200 root=/dev/ram0 rw init=/sbin/init quiet noapic nolapic nosmp acpi=off',
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        autostart: true,
        disable_mouse: true,
        disable_speaker: true,
      }) as V86Instance;

      // Attach event listeners
      this.emulator.add_listener('serial0-output-byte', this.outputByteHandler);
      this.emulator.add_listener('emulator-ready', this.readyHandler);
      this.emulator.add_listener('emulator-started', this.startedHandler);
      this.emulator.add_listener('emulator-stopped', this.stoppedHandler);
      this.emulator.add_listener(
        'download-progress',
        this.downloadProgressHandler
      );
      this.emulator.add_listener('download-error', this.downloadErrorHandler);
    } catch (err) {
      this.options.onStatus('error');
      this.options.onError(
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  // ----------------------------------------------------------------
  // Script loader — inserts a <script> tag and waits for onload
  // ----------------------------------------------------------------

  private _loadV86Script(): Promise<void> {
    const src = this.options.manifest.libv86 ?? '/linux/v1/libv86.js';
    return new Promise<void>((resolve, reject) => {
      const win = window as unknown as Record<string, unknown>;
      // Already on window — nothing to do
      if (win['V86']) {
        resolve();
        return;
      }
      // Script tag already injected — wait for it
      if (document.querySelector(`script[src="${src}"]`)) {
        const poll = setInterval(() => {
          if (win['V86']) {
            clearInterval(poll);
            resolve();
          }
        }, 50);
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error(`Failed to load v86 from ${src}`));
      document.head.appendChild(script);
    });
  }

  // ----------------------------------------------------------------
  // Serial output — byte accumulation and flushing
  // ----------------------------------------------------------------

  private _handleOutputByte(byte: number): void {
    const char = String.fromCharCode(byte);
    this.outputBuffer += char;

    // Flush on newline or when buffer exceeds threshold
    if (char === '\n' || this.outputBuffer.length >= FLUSH_BYTE_COUNT) {
      this._flush();
    } else {
      // Schedule a deferred flush for partial lines
      if (this.flushTimer === null) {
        this.flushTimer = setTimeout(() => this._flush(), FLUSH_TIMEOUT_MS);
      }
    }
  }

  private _flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.outputBuffer.length === 0) return;

    const chunk = this.outputBuffer;
    this.outputBuffer = '';

    // Detect Linux boot completion from serial output
    if (!this.bootDetected) {
      for (const pattern of BOOT_COMPLETE_PATTERNS) {
        if (pattern.test(chunk)) {
          this.bootDetected = true;
          this.options.onStatus('ready');
          break;
        }
      }
    }

    this.options.onSerialOutput(chunk);
  }

  // ----------------------------------------------------------------
  // sendInput — send text to the emulator's serial port
  // ----------------------------------------------------------------

  sendInput(text: string): void {
    if (!this.emulator) {
      throw new Error('Emulator is not initialised');
    }
    this.emulator.serial0_send(text);
  }

  // ----------------------------------------------------------------
  // Lifecycle control
  // ----------------------------------------------------------------

  start(): void {
    if (!this.emulator) return;
    this.emulator.run();
  }

  stop(): void {
    if (!this.emulator) return;
    this.emulator.stop();
    this.options.onStatus('stopped');
  }

  restart(): void {
    if (!this.emulator) return;
    this.bootDetected = false;
    this.options.onStatus('restarting');
    this.emulator.restart();
    this.options.onStatus('booting');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Cancel pending flush
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.emulator) {
      try {
        this.emulator.remove_listener(
          'serial0-output-byte',
          this.outputByteHandler
        );
        this.emulator.remove_listener('emulator-ready', this.readyHandler);
        this.emulator.remove_listener('emulator-started', this.startedHandler);
        this.emulator.remove_listener('emulator-stopped', this.stoppedHandler);
        this.emulator.remove_listener(
          'download-progress',
          this.downloadProgressHandler
        );
        this.emulator.remove_listener(
          'download-error',
          this.downloadErrorHandler
        );
        this.emulator.destroy();
      } catch {
        // Best effort — emulator may already be torn down
      }
      this.emulator = null;
    }
  }

  // ----------------------------------------------------------------
  // Accessors
  // ----------------------------------------------------------------

  get isReady(): boolean {
    return this.bootDetected;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

// ------------------------------------------------------------------
// Singleton factory
// ------------------------------------------------------------------

let _singleton: V86Controller | null = null;

/**
 * Returns a shared V86Controller instance.
 * Call `destroyV86Controller()` to tear it down (e.g. on unmount).
 */
export function createV86Controller(
  options: V86ControllerOptions
): V86Controller {
  if (_singleton) {
    _singleton.destroy();
  }
  _singleton = new V86Controller(options);
  return _singleton;
}

/**
 * Destroys the singleton controller and clears the reference.
 * Safe to call even if the controller was never initialised.
 */
export function destroyV86Controller(): void {
  if (_singleton) {
    _singleton.destroy();
    _singleton = null;
  }
}

/**
 * Returns the current singleton without creating a new one.
 */
export function getV86Controller(): V86Controller | null {
  return _singleton;
}
