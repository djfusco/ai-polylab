'use client';

import React from 'react';

interface ConsentModalProps {
  onConsent: () => void;
}

const CONSENT_TEXT = `This disposable Linux lab records commands and terminal output
in browser memory during this session.

Recent activity is sent to the AI only when you request help or
enable automatic hints.

Do not enter passwords, access tokens, private keys, personal
information, or sensitive institutional data.

Reloading or restarting clears the disposable VM and transcript.

This prototype provides formative AI feedback and is not intended
for high-stakes grading.`;

export default function ConsentModal({ onConsent }: ConsentModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: '#1e1e2e',
          border: '1px solid #45475a',
          borderRadius: '0.75rem',
          padding: '2rem',
          maxWidth: '540px',
          width: '100%',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          color: '#cdd6f4',
        }}
      >
        <h2
          id="consent-title"
          style={{
            fontSize: '1.25rem',
            fontWeight: '700',
            marginBottom: '1.25rem',
            color: '#89b4fa',
            margin: '0 0 1.25rem 0',
          }}
        >
          Browser Linux AI Lab
        </h2>

        <div
          style={{
            backgroundColor: '#181825',
            border: '1px solid #313244',
            borderRadius: '0.5rem',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            lineHeight: '1.65',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            color: '#cdd6f4',
          }}
        >
          {CONSENT_TEXT}
        </div>

        <button
          onClick={onConsent}
          style={{
            width: '100%',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#89b4fa',
            color: '#1e1e2e',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#74c7ec';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#89b4fa';
          }}
        >
          Start disposable lab
        </button>
      </div>
    </div>
  );
}
