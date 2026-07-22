// ============================================================
// Shared TypeScript types for browser-linux-ai-lab
// All files in this project import types from here.
// ============================================================

// ----------------------------------------------------------------
// V86 emulator interfaces
// ----------------------------------------------------------------

export interface V86ConstructorOptions {
  wasm_path?: string;
  bios?: { url: string };
  vga_bios?: { url: string };
  bzimage?: { url: string };
  initrd?: { url: string };
  cmdline?: string;
  memory_size?: number;
  vga_memory_size?: number;
  autostart?: boolean;
  disable_mouse?: boolean;
  disable_speaker?: boolean;
  disable_keyboard?: boolean;
}

export interface V86Instance {
  run(): void;
  stop(): void;
  destroy(): void;
  restart(): void;
  serial0_send(data: string): void;
  add_listener(event: string, callback: (...args: unknown[]) => void): void;
  remove_listener(event: string, callback: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    V86: new (options: V86ConstructorOptions) => V86Instance;
  }
}

// ----------------------------------------------------------------
// VM lifecycle
// ----------------------------------------------------------------

export type VmStatus =
  | 'not-started'
  | 'loading-assets'
  | 'booting'
  | 'ready'
  | 'restarting'
  | 'stopped'
  | 'error';

// ----------------------------------------------------------------
// Terminal events
// ----------------------------------------------------------------

export type TerminalEvent =
  | { type: 'input'; timestamp: string; data: string }
  | { type: 'output'; timestamp: string; data: string }
  | { type: 'command'; timestamp: string; command: string; cwd?: string }
  | { type: 'system'; timestamp: string; message: string };

// ----------------------------------------------------------------
// AI assistant
// ----------------------------------------------------------------

export type HintLevel = 'nudge' | 'conceptual' | 'command-guidance' | 'direct';
export type AssistantMode = 'question' | 'hint' | 'explain-error' | 'evaluate';

export interface AssistantRequest {
  mode: AssistantMode;
  question?: string;
  hintLevel: HintLevel;
  objective?: string;
  recentCommands: Array<{ command: string; timestamp: string }>;
  recentTranscript: string;
  hintUsage?: Array<{ level: string; timestamp: string }>;
}

export interface AssistantResponse {
  message: string;
  observations?: string[];
  suggestedCommands?: string[];
  confidence?: 'low' | 'medium' | 'high';
  formativeEvaluation?: FormativeEvaluation;
}

export interface FormativeEvaluation {
  taskCompletion?: string;
  strengths?: string[];
  missteps?: string[];
  recovery?: string[];
  verification?: string[];
  efficiency?: string[];
  nextPractice?: string[];
}

// ----------------------------------------------------------------
// Linux manifest (describes downloadable VM assets)
// ----------------------------------------------------------------

export interface LinuxManifest {
  version: string;
  kernel: string;       // URL path e.g. '/linux/v1/bzImage'
  filesystem: string;   // URL path e.g. '/linux/v1/rootfs.cpio.gz'
  wasm: string;         // URL path e.g. '/linux/v1/v86.wasm'
  bios: string;         // URL path e.g. '/linux/v1/seabios.bin'
  vgaBios: string;      // URL path e.g. '/linux/v1/vgabios.bin'
  libv86?: string;      // URL path to libv86.js (default '/linux/v1/libv86.js')
}

// ----------------------------------------------------------------
// V86 controller options
// ----------------------------------------------------------------

export interface V86ControllerOptions {
  manifest: LinuxManifest;
  onStatus: (status: VmStatus) => void;
  onError: (error: Error) => void;
  onSerialOutput: (data: string) => void;
  onDownloadProgress?: (loaded: number, total: number, fileName: string) => void;
}

// ----------------------------------------------------------------
// Terminal buffer state snapshot
// ----------------------------------------------------------------

export interface TerminalBufferState {
  events: TerminalEvent[];
  commands: Array<{ command: string; timestamp: string }>;
  transcript: string;
  sessionStartedAt: string;
  commandCount: number;
  hintUsageCount: number;
  lastActivityAt: string;
}

// ----------------------------------------------------------------
// Transcript export
// ----------------------------------------------------------------

export interface TranscriptExport {
  sessionStartedAt: string;
  sessionEndedAt: string;
  objective: string;
  commands: Array<{ command: string; timestamp: string }>;
  events: TerminalEvent[];
  assistantInteractions: AssistantInteraction[];
}

export interface AssistantInteraction {
  timestamp: string;
  mode: AssistantMode;
  hintLevel: HintLevel;
  question?: string;
  response: AssistantResponse;
}

// ----------------------------------------------------------------
// Evidence / evaluation
// ----------------------------------------------------------------

export interface EvidenceObservation {
  label: string;
  detected: boolean;
  evidence?: string;
}
