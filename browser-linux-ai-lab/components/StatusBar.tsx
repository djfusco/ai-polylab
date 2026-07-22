'use client';

import React from 'react';
import type { VmStatus } from '../lib/v86-types';

interface StatusBarProps {
  vmStatus: VmStatus;
  autoHintsEnabled: boolean;
  downloadProgress: { loaded: number; total: number; file: string } | null;
  bootMessage?: string;
  onRestart: () => void;
  onClearTranscript: () => void;
  onToggleAutoHints: () => void;
}

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  spinner: boolean;
}

const STATUS_CONFIG: Record<VmStatus, StatusConfig> = {
  'not-started': { label: 'Not started', color: '#a6adc8', bg: '#313244', spinner: false },
  'loading-assets': { label: 'Loading assets', color: '#89b4fa', bg: '#1e3a5f', spinner: true },
  booting: { label: 'Booting', color: '#f9e2af', bg: '#4a3000', spinner: true },
  ready: { label: 'Ready', color: '#a6e3a1', bg: '#1a3a1a', spinner: false },
  restarting: { label: 'Restarting', color: '#f9e2af', bg: '#4a3000', spinner: false },
  stopped: { label: 'Stopped', color: '#a6adc8', bg: '#313244', spinner: false },
  error: { label: 'Error', color: '#f38ba8', bg: '#3a1a1a', spinner: false },
};

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.75s linear infinite',
        marginRight: '5px',
        verticalAlign: 'middle',
      }}
      aria-hidden="true"
    />
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function StatusBar({
  vmStatus,
  autoHintsEnabled,
  downloadProgress,
  bootMessage,
  onRestart,
  onClearTranscript,
  onToggleAutoHints,
}: StatusBarProps) {
  const config = STATUS_CONFIG[vmStatus];
  const showProgress =
    (vmStatus === 'loading-assets' || vmStatus === 'booting') &&
    (downloadProgress !== null || bootMessage);

  const progressPercent =
    downloadProgress && downloadProgress.total > 0
      ? Math.round((downloadProgress.loaded / downloadProgress.total) * 100)
      : null;

  const restartDisabled = vmStatus === 'not-started' || vmStatus === 'loading-assets';

  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .statusbar-btn {
          padding: 0.3rem 0.75rem;
          border: 1px solid #45475a;
          border-radius: 0.375rem;
          background: #313244;
          color: #cdd6f4;
          font-size: 0.8rem;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
          white-space: nowrap;
        }
        .statusbar-btn:hover:not(:disabled) {
          background: #45475a;
        }
        .statusbar-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .statusbar-btn--active {
          background: #1e3a1a;
          border-color: #a6e3a1;
          color: #a6e3a1;
        }
      `}</style>

      <header
        style={{
          backgroundColor: '#181825',
          borderBottom: '1px solid #313244',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Title */}
          <span
            style={{
              fontWeight: '700',
              fontSize: '0.95rem',
              color: '#89b4fa',
              marginRight: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            Browser Linux AI Lab
          </span>

          {/* Status badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              fontWeight: '600',
              color: config.color,
              backgroundColor: config.bg,
              border: `1px solid ${config.color}44`,
              whiteSpace: 'nowrap',
            }}
            aria-live="polite"
            aria-label={`VM status: ${config.label}`}
          >
            {config.spinner && <Spinner />}
            {config.label}
          </span>

          {/* Controls */}
          <button
            className="statusbar-btn"
            onClick={onRestart}
            disabled={restartDisabled}
            title="Restart the Linux VM"
          >
            ↺ Restart Linux
          </button>

          <button
            className="statusbar-btn"
            onClick={onClearTranscript}
            title="Clear the session transcript"
          >
            Clear transcript
          </button>

          <button
            className={`statusbar-btn${autoHintsEnabled ? ' statusbar-btn--active' : ''}`}
            onClick={onToggleAutoHints}
            title="Toggle automatic AI hints"
            aria-pressed={autoHintsEnabled}
          >
            Auto hints: {autoHintsEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Privacy indicator */}
          <span
            style={{
              fontSize: '0.78rem',
              color: '#a6adc8',
              whiteSpace: 'nowrap',
            }}
            title="No telemetry or server-side tracking"
          >
            🔒 No tracking
          </span>
        </div>

        {/* Progress bar row */}
        {showProgress && (
          <div
            style={{
              padding: '0 1rem 0.4rem 1rem',
            }}
          >
            {downloadProgress && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.2rem',
                }}
              >
                <span
                  style={{ fontSize: '0.75rem', color: '#a6adc8', flexShrink: 0 }}
                  aria-live="polite"
                >
                  {downloadProgress.file
                    ? `Downloading ${downloadProgress.file}…`
                    : 'Downloading…'}
                  {progressPercent !== null && ` (${progressPercent}%)`}
                  {` ${formatBytes(downloadProgress.loaded)}`}
                  {downloadProgress.total > 0 &&
                    ` / ${formatBytes(downloadProgress.total)}`}
                </span>

                <div
                  style={{
                    flex: 1,
                    height: '4px',
                    backgroundColor: '#313244',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                  role="progressbar"
                  aria-valuenow={progressPercent ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    style={{
                      height: '100%',
                      backgroundColor: '#89b4fa',
                      borderRadius: '2px',
                      width:
                        progressPercent !== null ? `${progressPercent}%` : '100%',
                      transition: 'width 0.2s ease',
                      animation:
                        progressPercent === null
                          ? 'indeterminate 1.5s ease-in-out infinite'
                          : 'none',
                    }}
                  />
                </div>
              </div>
            )}

            {bootMessage && (
              <p
                style={{
                  fontSize: '0.75rem',
                  color: '#f9e2af',
                  margin: 0,
                }}
                aria-live="polite"
              >
                {bootMessage}
              </p>
            )}
          </div>
        )}
      </header>

      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); width: 40%; }
          50% { width: 60%; }
          100% { transform: translateX(250%); width: 40%; }
        }
      `}</style>
    </>
  );
}
