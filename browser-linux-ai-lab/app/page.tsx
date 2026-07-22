'use client';

/**
 * app/page.tsx
 *
 * Top-level orchestrator for Browser Linux AI Lab.
 *
 * Responsibilities:
 *  - Manage all application state (VM, assistant, UI)
 *  - Initialise V86Controller after user consent + terminal ready
 *  - Route v86 serial output → xterm terminal + TerminalBuffer
 *  - Route xterm keyboard input → V86Controller + TerminalBuffer
 *  - Call the /api/assistant route and track interaction history
 *  - Pass down stable callbacks to all child components
 *
 * Security notes:
 *  - No API key in this file — all AI calls go through /api/assistant
 *  - No dangerouslySetInnerHTML anywhere
 *  - No automatic command execution
 */

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AssistantInteraction,
  AssistantMode,
  AssistantRequest,
  AssistantResponse,
  HintLevel,
  LinuxManifest,
  VmStatus,
} from '@/lib/v86-types';
import type { V86Controller } from '@/lib/v86-controller';
import { TerminalBuffer } from '@/lib/terminal-buffer';
import {
  buildTranscriptExport,
  downloadTranscriptAsJSON,
  copyTranscriptAsText,
} from '@/lib/transcript';

/* ----------------------------------------------------------------
   Dynamically-loaded components (browser-only, no SSR)
   ---------------------------------------------------------------- */
const LinuxTerminal = dynamic(
  () => import('@/components/LinuxTerminal'),
  {
    ssr: false,
    loading: () => (
      <div className="terminal-placeholder">Initializing terminal…</div>
    ),
  },
);

const AssistantPanel = dynamic(
  () => import('@/components/AssistantPanel'),
  { ssr: false },
);

const StatusBar = dynamic(
  () => import('@/components/StatusBar'),
  { ssr: false },
);

const ConsentModal = dynamic(
  () => import('@/components/ConsentModal'),
  { ssr: false },
);

/* ----------------------------------------------------------------
   Constants
   ---------------------------------------------------------------- */

/**
 * Lab objective text shown in the consent modal and sent to the
 * AI assistant as context for every request.
 */
const LAB_OBJECTIVE = `==================================================
 Browser Linux AI Lab
==================================================

Objective:

A file named /root/lab/dispatch.bin contains compressed
tab-separated dispatch data.

Complete the following tasks:

1. Determine the compression format.
2. Extract the file as /root/lab/dispatch.tsv.
3. Display the first five records.
4. Determine the number of data rows.
5. Verify that the extracted file is tab-separated text.

You may ask the AI assistant for help.

Commands entered in this disposable lab may be analyzed
for instructional feedback.
==================================================`;

/**
 * Static manifest pointing at the public/linux/v1/* assets.
 * NOTE: these files are served from the public/ directory and are
 * therefore publicly downloadable — they are non-sensitive VM images.
 */
const MANIFEST: LinuxManifest = {
  version:    'v1',
  kernel:     '/linux/v1/bzImage',
  filesystem: '/linux/v1/rootfs.cpio.gz',
  wasm:       '/linux/v1/v86.wasm',
  bios:       '/linux/v1/seabios.bin',
  vgaBios:    '/linux/v1/vgabios.bin',
  libv86:     '/linux/v1/libv86.js',
};

/** Soft cap on AI interactions retained in state (memory). */
const MAX_INTERACTIONS = 20;

/* ----------------------------------------------------------------
   Handle type exposed by LinuxTerminal via its onMount callback
   ---------------------------------------------------------------- */
export interface LinuxTerminalHandle {
  /** Write raw string/escape-sequence data to the xterm instance. */
  write: (data: string) => void;
  /** Clear all scrollback and the visible viewport. */
  clear: () => void;
}

/* ----------------------------------------------------------------
   Page component
   ---------------------------------------------------------------- */
export default function LabPage() {
  /* ---- Core UI state ----------------------------------------- */
  const [consented, setConsented]             = useState(false);
  const [terminalReady, setTerminalReady]     = useState(false);
  const [vmStatus, setVmStatus]               = useState<VmStatus>('not-started');
  const [bootProgress, setBootProgress]       = useState('');
  const [downloadProgress, setDownloadProgress] = useState<{
    loaded: number;
    total:  number;
    file:   string;
  } | null>(null);
  const [autoHintsEnabled, setAutoHintsEnabled] = useState(false);
  /* ---- Assistant state --------------------------------------- */
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [interactions, setInteractions]         = useState<AssistantInteraction[]>([]);

  /* ---- Additional UI state ----------------------------------- */
  const [hintLevel, setHintLevel]               = useState<HintLevel>('nudge');
  const [includeObjective, setIncludeObjective] = useState(true);
  const [commandCount, setCommandCount]         = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null)

  /* ---- Refs (browser-only, never trigger re-renders) --------- */
  /** Handle to the xterm terminal component. */
  const terminalHandleRef = useRef<LinuxTerminalHandle | null>(null);

  /** V86 emulator controller — created after consent. */
  const v86ControllerRef = useRef<V86Controller | null>(null);

  /** Ring-buffer of terminal events / commands / transcript. */
  const terminalBufferRef = useRef<TerminalBuffer | null>(null);

  /** Ordered hint-usage log for AI context (max 20 entries). */
  const hintHistoryRef = useRef<Array<{ level: string; timestamp: string }>>([]);

  /** Guard: prevent duplicate VM initialisation under React Strict Mode. */
  const vmInitialisedRef = useRef(false);

  /* ---- Lazy-initialise TerminalBuffer ------------------------ */
  // TerminalBuffer has no browser-only APIs — safe to import statically.
  function getBuffer(): TerminalBuffer {
    if (!terminalBufferRef.current) {
      terminalBufferRef.current = new TerminalBuffer();
    }
    return terminalBufferRef.current;
  }

  /* ================================================================
     VM status handler
     ================================================================ */
  const handleVmStatus = useCallback((status: VmStatus) => {
    setVmStatus(status);
    switch (status) {
      case 'loading-assets':
        setBootProgress('Downloading VM assets…');
        break;
      case 'booting':
        setBootProgress('Booting Linux kernel…');
        setDownloadProgress(null);
        break;
      case 'ready':
        setBootProgress('');
        setDownloadProgress(null);
        setSessionStartedAt(prev => prev ?? new Date().toISOString());
        break;
      case 'error':
      case 'stopped':
        setBootProgress('');
        setDownloadProgress(null);
        break;
      default:
        break;
    }
  }, []);

  /* ================================================================
     VM error handler
     ================================================================ */
  const handleVmError = useCallback((error: Error) => {
    console.error('[LabPage] VM error:', error);
    setVmStatus('error');
    setBootProgress('');
    setDownloadProgress(null);
  }, []);

  /* ================================================================
     Serial output from v86 → xterm + buffer
     ================================================================ */
  const handleSerialOutput = useCallback((data: string) => {
    // Write raw bytes/escape sequences to the visible terminal
    terminalHandleRef.current?.write(data);
    // Accumulate in buffer for AI context
    getBuffer().addOutput(data);
  }, []); // refs are stable — no deps needed

  /* ================================================================
     Keyboard input from xterm → v86 + buffer
     ================================================================ */
  const handleTerminalData = useCallback((data: string) => {
    // Only forward to VM when it is in an interactive state
    if (vmStatus === 'ready' || vmStatus === 'booting') {
      v86ControllerRef.current?.sendInput(data);
    }
    getBuffer().addInput(data);
    // Count Enter key presses as approximate command submissions
    if (data === '\r') {
      setCommandCount(c => c + 1);
    }
  }, [vmStatus]);

  /* ================================================================
     Terminal ready callback (fired by LinuxTerminal via onReady)
     ================================================================ */
  const handleTerminalReady = useCallback(
    (write: (data: string) => void, clear: () => void) => {
      terminalHandleRef.current = { write, clear };
      setTerminalReady(true);
    },
    [],
  );

  /* ================================================================
     User consent → mark as consented; VM initialisation follows via
     the useEffect below once terminalReady is also true.
     ================================================================ */
  function handleConsent() {
    setConsented(true);
  }

  /* ================================================================
     VM initialisation effect
     Runs when both consented AND terminalReady are true.
     ================================================================ */
  useEffect(() => {
    if (!consented || !terminalReady) return;

    // React Strict Mode guard: only one emulator instance per mount
    if (vmInitialisedRef.current) return;
    vmInitialisedRef.current = true;

    let controller: V86Controller | null = null;

    async function initVM() {
      // Dynamic import keeps v86 out of the server bundle entirely
      const { V86Controller: Controller } = await import('@/lib/v86-controller') as {
        V86Controller: new (options: import('@/lib/v86-types').V86ControllerOptions) => V86Controller;
      };

      controller = new Controller({
        manifest:       MANIFEST,
        onStatus:       handleVmStatus,
        onError:        handleVmError,
        onSerialOutput: handleSerialOutput,
        onDownloadProgress: (loaded, total, file) => {
          setDownloadProgress({ loaded, total, file });
        },
      });

      v86ControllerRef.current = controller;
      await controller.init();
    }

    initVM().catch(handleVmError);

    return () => {
      vmInitialisedRef.current = false;
      if (controller) {
        controller.destroy();
        v86ControllerRef.current = null;
      }
    };
  }, [consented, terminalReady, handleVmStatus, handleVmError, handleSerialOutput]);

  /* ================================================================
     Restart handler
     ================================================================ */
  const handleRestart = useCallback(async () => {
    const controller = v86ControllerRef.current;
    if (!controller) return;

    if (
      !window.confirm(
        'Restart the virtual machine?\n\n' +
        'All running processes will be terminated and the filesystem ' +
        'will be reset to its initial state. This cannot be undone.',
      )
    ) return;

    setVmStatus('restarting');
    terminalHandleRef.current?.clear();
    getBuffer().clear();
    hintHistoryRef.current = [];

    try {
      await controller.restart();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleVmError(error);
    }
  }, [handleVmError]);

  /* ================================================================
     Clear transcript handler
     ================================================================ */
  const handleClearTranscript = useCallback(() => {
    if (
      !window.confirm(
        'Clear the AI context transcript?\n\n' +
        'This resets the assistant\'s memory of your session. ' +
        'The terminal display is not affected.',
      )
    ) return;

    getBuffer().clear();
    hintHistoryRef.current = [];
    setCommandCount(0);
  }, []);

  /* ================================================================
     Core assistant API call
     ================================================================ */
  const askAssistant = useCallback(
    async (mode: AssistantMode, hintLevel: HintLevel, question?: string) => {
      if (assistantLoading) return;

      setAssistantLoading(true);

      try {
        const buffer = getBuffer();
        const state  = buffer.getState();

        const request: AssistantRequest = {
          mode,
          hintLevel,
          question,
          objective:       LAB_OBJECTIVE,
          recentCommands:  state.commands.slice(-50),
          recentTranscript: state.transcript.slice(-12_000),
          hintUsage:       hintHistoryRef.current.slice(-20),
        };

        const res = await fetch('/api/assistant', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(request),
        });

        if (!res.ok) {
          let message = `Request failed (HTTP ${res.status})`;
          try {
            const errJson = await res.json();
            if (typeof errJson.error === 'string') message = errJson.error;
          } catch {
            // keep default message
          }
          throw new Error(message);
        }

        const response: AssistantResponse = await res.json();

        if (typeof response.message !== 'string' || !response.message) {
          throw new Error('Received an invalid response from the assistant.');
        }

        // Record hint usage for future context
        if (mode === 'hint') {
          hintHistoryRef.current = [
            ...hintHistoryRef.current.slice(-49),
            { level: hintLevel, timestamp: new Date().toISOString() },
          ];
        }

        const interaction: AssistantInteraction = {
          timestamp: new Date().toISOString(),
          mode,
          hintLevel,
          question,
          response,
        };

        setInteractions(prev => [
          ...prev.slice(-(MAX_INTERACTIONS - 1)),
          interaction,
        ]);
        setAssistantLoading(false);

      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';
        // Surface errors as a synthetic assistant interaction
        setInteractions(prev => [
          ...prev.slice(-(MAX_INTERACTIONS - 1)),
          {
            timestamp: new Date().toISOString(),
            mode,
            hintLevel,
            question,
            response: { message: `⚠️ ${message}` },
          },
        ]);
        setAssistantLoading(false);
      }
    },
    [assistantLoading], // re-create only when loading state changes
  );

  /* ================================================================
     Public assistant entry points (passed as props)
     ================================================================ */
  const handleAskQuestion = useCallback(
    (question: string) => askAssistant('question', hintLevel, question),
    [askAssistant, hintLevel],
  );

  const handleAskHint = useCallback(
    () => askAssistant('hint', hintLevel),
    [askAssistant, hintLevel],
  );

  const handleExplainError = useCallback(
    () => askAssistant('explain-error', 'conceptual'),
    [askAssistant],
  );

  const handleEvaluate = useCallback(
    () => askAssistant('evaluate', 'direct'),
    [askAssistant],
  );

  /* ================================================================
     Transcript download / copy
     ================================================================ */
  const handleDownloadTranscript = useCallback(() => {
    const state = getBuffer().getState();
    const transcript = buildTranscriptExport({
      buffer: state,
      interactions,
      objective: LAB_OBJECTIVE,
    });
    downloadTranscriptAsJSON(transcript);
  }, [interactions]);

  const handleCopyTranscript = useCallback(async () => {
    const state = getBuffer().getState();
    const transcript = buildTranscriptExport({
      buffer: state,
      interactions,
      objective: LAB_OBJECTIVE,
    });
    await copyTranscriptAsText(transcript);
  }, [interactions]);

  /* ================================================================
     Toggle auto-hints
     ================================================================ */
  const handleToggleAutoHints = useCallback(() => {
    setAutoHintsEnabled(prev => !prev);
  }, []);

  /* ================================================================
     Derived / memoised values
     ================================================================ */

  /**
   * Show download progress only while assets are loading and we have
   * meaningful progress info (total > 0).
   */
  const visibleProgress = useMemo(() => {
    if (vmStatus !== 'loading-assets') return null;
    if (!downloadProgress || downloadProgress.total === 0) return null;
    return downloadProgress;
  }, [vmStatus, downloadProgress]);

  /* ================================================================
     Render
     ================================================================ */
  return (
    <main className="lab-container">
      {/* ---- Top status bar ------------------------------------ */}
      <StatusBar
        vmStatus={vmStatus}
        bootMessage={bootProgress}
        downloadProgress={visibleProgress}
        autoHintsEnabled={autoHintsEnabled}
        onRestart={handleRestart}
        onClearTranscript={handleClearTranscript}
        onToggleAutoHints={handleToggleAutoHints}
      />

      {/* ---- Two-column content area --------------------------- */}
      <div className="lab-content">
        {/* Left: xterm / v86 terminal */}
        <div className="terminal-panel">
          <LinuxTerminal
            vmStatus={vmStatus}
            onSendInput={handleTerminalData}
            commandCount={commandCount}
            sessionStartedAt={sessionStartedAt}
            onDownloadTranscript={handleDownloadTranscript}
            onCopyTranscript={handleCopyTranscript}
            onResetVm={handleRestart}
            onReady={handleTerminalReady}
          />
        </div>

        {/* Right: AI assistant */}
        <div className="assistant-panel">
          <AssistantPanel
            interactions={interactions}
            isLoading={assistantLoading}
            hintLevel={hintLevel}
            autoHintsEnabled={autoHintsEnabled}
            includeObjective={includeObjective}
            onAskQuestion={handleAskQuestion}
            onAskHint={handleAskHint}
            onExplainError={handleExplainError}
            onEvaluate={handleEvaluate}
            onChangeHintLevel={setHintLevel}
            onToggleAutoHints={handleToggleAutoHints}
            onToggleIncludeObjective={() => setIncludeObjective(p => !p)}
            onClearConversation={() => setInteractions([])}
          />
        </div>
      </div>

      {/* ---- Consent modal (shown until user clicks Start) ----- */}
      {!consented && (
        <ConsentModal
          onConsent={handleConsent}
        />
      )}
    </main>
  );
}
