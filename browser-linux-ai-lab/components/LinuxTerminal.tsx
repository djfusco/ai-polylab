'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { VmStatus } from '../lib/v86-types';

interface LinuxTerminalProps {
  vmStatus: VmStatus;
  onSendInput: (data: string) => void;
  commandCount: number;
  sessionStartedAt: string | null;
  artifactsMissing?: boolean;
  onDownloadTranscript: () => void;
  onCopyTranscript: () => void;
  onResetVm: () => void;
  onReady: (
    writeToTerminal: (data: string) => void,
    clearTerminal: () => void
  ) => void;
}

const STATUS_LABELS: Record<VmStatus, string> = {
  'not-started': 'Waiting to start…',
  'loading-assets': 'Loading Linux assets…',
  booting: 'Booting Linux…',
  ready: 'Linux ready',
  restarting: 'Restarting…',
  stopped: 'VM stopped',
  error: 'VM error',
};

function useSessionTimer(sessionStartedAt: string | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!sessionStartedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      const start = new Date(sessionStartedAt).getTime();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  return elapsed;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function LinuxTerminal({
  vmStatus,
  onSendInput,
  commandCount,
  sessionStartedAt,
  artifactsMissing = false,
  onDownloadTranscript,
  onCopyTranscript,
  onResetVm,
  onReady,
}: LinuxTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const termRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  const onReadyCalledRef = useRef(false);
  const onSendInputRef = useRef(onSendInput);
  const elapsed = useSessionTimer(sessionStartedAt);

  // Keep ref current so terminal onData closure doesn't stale-capture
  useEffect(() => {
    onSendInputRef.current = onSendInput;
  }, [onSendInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!containerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let term: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fitAddon: any = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;

    // Guard against React Strict Mode double-mount
    if (termRef.current) return;

    Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/xterm/css/xterm.css' as string),
    ])
      .catch(() =>
        Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      )
      .then(([xtermMod, fitMod]) => {
        if (disposed || !containerRef.current) return;

        const { Terminal } = xtermMod as typeof import('@xterm/xterm');
        const { FitAddon } = fitMod as typeof import('@xterm/addon-fit');

        term = new Terminal({
          theme: {
            background: '#0d0d17',
            foreground: '#cdd6f4',
            cursor: '#cdd6f4',
            black: '#45475a',
            red: '#f38ba8',
            green: '#a6e3a1',
            yellow: '#f9e2af',
            blue: '#89b4fa',
            magenta: '#cba6f7',
            cyan: '#89dceb',
            white: '#bac2de',
            brightBlack: '#585b70',
            brightRed: '#f38ba8',
            brightGreen: '#a6e3a1',
            brightYellow: '#f9e2af',
            brightBlue: '#89b4fa',
            brightMagenta: '#cba6f7',
            brightCyan: '#89dceb',
            brightWhite: '#a6adc8',
          },
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          fontSize: 13,
          lineHeight: 1.2,
          cursorBlink: true,
          cursorStyle: 'block',
          scrollback: 5000,
          allowProposedApi: false,
        });

        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);
        fitAddon.fit();

        term.onData((data: string) => {
          onSendInputRef.current(data);
        });

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // ResizeObserver for responsive fit
        if (containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            try {
              fitAddonRef.current?.fit();
            } catch {
              // ignore resize errors after dispose
            }
          });
          resizeObserver.observe(containerRef.current);
        }

        if (!onReadyCalledRef.current) {
          onReadyCalledRef.current = true;
          onReady(
            (data: string) => {
              termRef.current?.write(data);
            },
            () => {
              termRef.current?.clear();
            }
          );
        }
      })
      .catch((err: unknown) => {
        console.error('[LinuxTerminal] Failed to initialize xterm:', err);
      });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      try {
        termRef.current?.dispose();
      } catch {
        // ignore
      }
      termRef.current = null;
      fitAddonRef.current = null;
      onReadyCalledRef.current = false;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFocus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const showMissingArtifacts =
    artifactsMissing || (vmStatus === 'error');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        backgroundColor: '#0d0d17',
        border: '1px solid #313244',
        borderRadius: '0.5rem',
        overflow: 'hidden',
      }}
    >
      {/* Terminal area */}
      <div
        ref={containerRef}
        onClick={handleFocus}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '4px',
          cursor: 'text',
          position: 'relative',
        }}
        aria-label="Linux terminal"
        role="application"
      />

      {/* Missing artifacts overlay */}
      {showMissingArtifacts && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(13, 13, 23, 0.92)',
            zIndex: 10,
            padding: '2rem',
            textAlign: 'center',
            borderRadius: '0.5rem',
          }}
          role="alert"
        >
          <p
            style={{
              color: '#f38ba8',
              fontFamily: 'monospace',
              marginBottom: '0.75rem',
              lineHeight: 1.6,
            }}
          >
            Linux VM artifacts have not been generated.
          </p>
          <p
            style={{
              color: '#cdd6f4',
              fontFamily: 'monospace',
              marginBottom: '1.5rem',
            }}
          >
            Run:{' '}
            <code
              style={{
                backgroundColor: '#313244',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.25rem',
              }}
            >
              npm run build:linux
            </code>
          </p>
          <button
            onClick={onResetVm}
            style={{
              padding: '0.4rem 1rem',
              backgroundColor: '#89b4fa',
              color: '#1e1e2e',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Status bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.35rem 0.75rem',
          backgroundColor: '#181825',
          borderTop: '1px solid #313244',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            fontSize: '0.75rem',
            color: '#a6adc8',
            flexShrink: 0,
          }}
        >
          <span aria-live="polite">{STATUS_LABELS[vmStatus]}</span>
          <span>Commands: {commandCount}</span>
          {sessionStartedAt && (
            <span>Session: {formatElapsed(elapsed)}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={onDownloadTranscript}
            style={btnStyle}
            title="Download terminal transcript"
          >
            Download transcript
          </button>
          <button
            onClick={onCopyTranscript}
            style={btnStyle}
            title="Copy terminal transcript to clipboard"
          >
            Copy transcript
          </button>
          <button
            onClick={onResetVm}
            style={{ ...btnStyle, borderColor: '#f38ba855', color: '#f38ba8' }}
            title="Reset the VM (destroys current session)"
          >
            Reset VM
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '0.25rem 0.6rem',
  border: '1px solid #45475a',
  borderRadius: '0.25rem',
  background: '#313244',
  color: '#cdd6f4',
  fontSize: '0.75rem',
  cursor: 'pointer',
};
