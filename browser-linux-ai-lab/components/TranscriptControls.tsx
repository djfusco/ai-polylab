'use client';

import React from 'react';

interface TranscriptControlsProps {
  onDownload: () => void;
  onCopy: () => void;
  hasContent: boolean;
}

export default function TranscriptControls({
  onDownload,
  onCopy,
  hasContent,
}: TranscriptControlsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
      }}
    >
      <button
        onClick={onDownload}
        disabled={!hasContent}
        style={{
          padding: '0.3rem 0.75rem',
          border: '1px solid #45475a',
          borderRadius: '0.375rem',
          background: '#313244',
          color: '#cdd6f4',
          fontSize: '0.82rem',
          cursor: hasContent ? 'pointer' : 'not-allowed',
          opacity: hasContent ? 1 : 0.4,
          transition: 'background 0.15s, opacity 0.15s',
        }}
        title={hasContent ? 'Download transcript as text file' : 'No transcript to download'}
        aria-disabled={!hasContent}
      >
        Download transcript
      </button>

      <button
        onClick={onCopy}
        disabled={!hasContent}
        style={{
          padding: '0.3rem 0.75rem',
          border: '1px solid #45475a',
          borderRadius: '0.375rem',
          background: '#313244',
          color: '#cdd6f4',
          fontSize: '0.82rem',
          cursor: hasContent ? 'pointer' : 'not-allowed',
          opacity: hasContent ? 1 : 0.4,
          transition: 'background 0.15s, opacity 0.15s',
        }}
        title={hasContent ? 'Copy transcript to clipboard' : 'No transcript to copy'}
        aria-disabled={!hasContent}
      >
        Copy transcript
      </button>
    </div>
  );
}
