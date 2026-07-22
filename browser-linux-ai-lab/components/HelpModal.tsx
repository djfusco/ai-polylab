'use client';

import React, { useEffect, useCallback } from 'react';

interface HelpModalProps {
  onClose: () => void;
}

export default function HelpModal({ onClose }: HelpModalProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to use the lab"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#1e1e2e',
          border: '1px solid #45475a',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          color: '#cdd6f4',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#89b4fa', fontWeight: '700' }}>
            How to use Browser Linux AI Lab
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#a6adc8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
            }}
            aria-label="Close help"
          >
            ✕
          </button>
        </div>

        <Section title="Overview">
          <p>
            This lab runs a real Linux system in your browser using the v86 x86 emulator.
            The left panel is a live terminal connected to the VM; the right panel is an AI
            teaching assistant that watches your session and helps you learn.
          </p>
        </Section>

        <Section title="Terminal">
          <Item label="Click to type">
            Click anywhere in the terminal panel to give it keyboard focus, then type normally.
          </Item>
          <Item label="Reset VM">
            Restarts the Linux VM from scratch — all running processes are killed and the
            filesystem resets to its initial state.
          </Item>
          <Item label="Download / Copy transcript">
            Saves the full session transcript (commands + output) as JSON, or copies a
            plain-text version to your clipboard.
          </Item>
        </Section>

        <Section title="AI Assistant buttons">
          <Item label="Ask">
            Type a free-form question in the text box and press Ask (or Ctrl+Enter).
            The AI sees your question, the lab objective (if enabled), and your recent
            terminal output.
          </Item>
          <Item label="Get hint">
            Asks the AI for a hint calibrated to your current Hint Level (see below).
            No question text needed — the AI reads your terminal history automatically.
          </Item>
          <Item label="Explain error">
            Always uses Conceptual level. Asks the AI to identify the most recent error
            in your terminal output and explain what went wrong and why.
          </Item>
          <Item label="Evaluate approach">
            Always uses Direct level. Asks the AI for structured formative feedback on
            your progress: task completion, strengths, missteps, verification, efficiency,
            and suggested next practice. Shown in the blue feedback block.
          </Item>
        </Section>

        <Section title="Hint level">
          <p style={{ marginBottom: '0.5rem' }}>
            Controls how much help the AI gives for <strong>Get hint</strong> and free-form <strong>Ask</strong>.
            (Explain error and Evaluate approach ignore this setting.)
          </p>
          <Item label="Nudge">
            Points you toward the next observation or concept — no commands given.
            Good for when you just need a small push.
          </Item>
          <Item label="Conceptual">
            Explains the relevant Linux concept or tool without completing the task.
          </Item>
          <Item label="Command guidance">
            Shows relevant command structure, flags, or syntax without solving the full task.
          </Item>
          <Item label="Direct">
            Provides exact commands with explanations. Use when you are stuck and need
            to see the answer.
          </Item>
        </Section>

        <Section title="Auto hints">
          <p>
            When enabled, the AI automatically fires a <strong>Nudge</strong>-level hint if you
            haven&apos;t typed a new command for 45 seconds. The timer resets each time you press
            Enter. The hint fires once per idle period — it won&apos;t keep repeating until you
            run another command first.
          </p>
        </Section>

        <Section title="Include lab objective">
          <p>
            When checked (default), every AI request includes the full lab objective so the AI
            can guide you toward the tasks. Uncheck it to ask general Linux questions without the
            AI steering you back to the lab — useful for exploring concepts freely.
          </p>
        </Section>

        <Section title="Auto hints: ON/OFF (top bar)">
          <p>
            Quick toggle for auto hints — same as the checkbox in the assistant panel.
            Shown in the top status bar for easy access.
          </p>
        </Section>

        <Section title="Clear transcript">
          <p>
            Resets the AI&apos;s memory of your session (commands and output seen so far).
            The terminal display is not affected — the VM keeps running.
          </p>
        </Section>

        <div style={{ textAlign: 'right', marginTop: '1.25rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 1.25rem',
              backgroundColor: '#89b4fa',
              color: '#1e1e2e',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '700',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.875rem', fontWeight: '700', color: '#cba6f7' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p style={{ margin: '0.25rem 0' }}>
      <strong style={{ color: '#f9e2af' }}>{label}:</strong>{' '}{children}
    </p>
  );
}
