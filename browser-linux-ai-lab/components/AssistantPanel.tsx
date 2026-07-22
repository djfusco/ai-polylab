'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type {
  HintLevel,
  AssistantInteraction,
  AssistantResponse,
  FormativeEvaluation,
} from '../lib/v86-types';

interface AssistantPanelProps {
  interactions: AssistantInteraction[];
  isLoading: boolean;
  hintLevel: HintLevel;
  autoHintsEnabled: boolean;
  includeObjective: boolean;
  onAskQuestion: (question: string) => void;
  onAskHint: () => void;
  onExplainError: () => void;
  onEvaluate: () => void;
  onChangeHintLevel: (level: HintLevel) => void;
  onToggleAutoHints: () => void;
  onToggleIncludeObjective: () => void;
  onClearConversation: () => void;
}

const HINT_LEVELS: { value: HintLevel; label: string }[] = [
  { value: 'nudge', label: 'Nudge' },
  { value: 'conceptual', label: 'Conceptual' },
  { value: 'command-guidance', label: 'Command guidance' },
  { value: 'direct', label: 'Direct' },
];

const RATE_LIMIT_SECONDS = 5;

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '0.15rem 0.5rem',
        fontSize: '0.7rem',
        border: '1px solid #45475a',
        borderRadius: '0.25rem',
        background: '#313244',
        color: copied ? '#a6e3a1' : '#cdd6f4',
        cursor: 'pointer',
        transition: 'color 0.2s',
      }}
      title="Copy to clipboard"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function CodeBlock({ command }: { command: string }) {
  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: '#0d0d17',
        border: '1px solid #45475a',
        borderRadius: '0.375rem',
        padding: '0.5rem 0.75rem',
        marginTop: '0.4rem',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '0.4rem',
          right: '0.5rem',
        }}
      >
        <CopyButton text={command} />
      </div>
      <pre
        style={{
          margin: 0,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: '0.8rem',
          color: '#a6e3a1',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          paddingRight: '4rem',
        }}
      >
        <code>{command}</code>
      </pre>
    </div>
  );
}

function FormativeBlock({
  evaluation,
}: {
  evaluation: FormativeEvaluation;
}) {
  const sections: Array<{ label: string; items?: string[]; text?: string }> = [
    { label: 'Task completion', text: evaluation.taskCompletion },
    { label: 'Strengths', items: evaluation.strengths },
    { label: 'Areas to revisit', items: evaluation.missteps },
    { label: 'Recovery suggestions', items: evaluation.recovery },
    { label: 'Verification', items: evaluation.verification },
    { label: 'Efficiency', items: evaluation.efficiency },
    { label: 'Next practice', items: evaluation.nextPractice },
  ].filter(s => (s.text && s.text.length > 0) || (s.items && s.items.length > 0));

  return (
    <div
      style={{
        backgroundColor: '#1e1e2e',
        border: '1px solid #89b4fa44',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        marginTop: '0.5rem',
      }}
    >
      <p
        style={{
          fontSize: '0.75rem',
          fontWeight: '700',
          color: '#89b4fa',
          margin: '0 0 0.5rem 0',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Formative AI feedback
      </p>
      {sections.map(section => (
        <div key={section.label} style={{ marginBottom: '0.5rem' }}>
          <p
            style={{
              fontSize: '0.78rem',
              fontWeight: '600',
              color: '#cba6f7',
              margin: '0 0 0.2rem 0',
            }}
          >
            {section.label}
          </p>
          {section.text && (
            <p style={{ fontSize: '0.82rem', color: '#cdd6f4', margin: 0 }}>
              {section.text}
            </p>
          )}
          {section.items && section.items.length > 0 && (
            <ul
              style={{
                margin: '0.1rem 0 0 0',
                paddingLeft: '1.25rem',
                fontSize: '0.82rem',
                color: '#cdd6f4',
              }}
            >
              {section.items.map((item, i) => (
                <li key={i} style={{ marginBottom: '0.1rem' }}>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p
        style={{
          fontSize: '0.7rem',
          color: '#a6adc8',
          fontStyle: 'italic',
          margin: '0.4rem 0 0 0',
        }}
      >
        This is formative feedback, not an authoritative grade.
      </p>
    </div>
  );
}

function AssistantMessage({ response }: { response: AssistantResponse }) {
  return (
    <div>
      {/* Main message text — plain text only */}
      <p style={{ margin: '0 0 0.4rem 0', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {response.message}
      </p>

      {/* Observations */}
      {response.observations && response.observations.length > 0 && (
        <div style={{ marginBottom: '0.4rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#cba6f7', margin: '0 0 0.2rem 0' }}>
            Observations
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem' }}>
            {response.observations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested commands */}
      {response.suggestedCommands && response.suggestedCommands.length > 0 && (
        <div style={{ marginBottom: '0.4rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#cba6f7', margin: '0 0 0.2rem 0' }}>
            Suggested commands
          </p>
          {response.suggestedCommands.map((cmd, i) => (
            <CodeBlock key={i} command={cmd} />
          ))}
        </div>
      )}

      {/* Formative evaluation */}
      {response.formativeEvaluation && (
        <FormativeBlock evaluation={response.formativeEvaluation} />
      )}

      {/* Confidence */}
      {response.confidence && (
        <p style={{ fontSize: '0.7rem', color: '#a6adc8', margin: '0.3rem 0 0 0' }}>
          Confidence: {response.confidence}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AssistantPanel({
  interactions,
  isLoading,
  hintLevel,
  autoHintsEnabled,
  includeObjective,
  onAskQuestion,
  onAskHint,
  onExplainError,
  onEvaluate,
  onChangeHintLevel,
  onToggleAutoHints,
  onToggleIncludeObjective,
  onClearConversation,
}: AssistantPanelProps) {
  const [question, setQuestion] = useState('');
  const [rateLimitRemaining, setRateLimitRemaining] = useState(0);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new interaction added
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions, isLoading]);

  // Apply rate limit after each interaction
  const interactionCount = interactions.length;
  useEffect(() => {
    if (interactionCount === 0) return;
    setRateLimitRemaining(RATE_LIMIT_SECONDS);
    const interval = setInterval(() => {
      setRateLimitRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [interactionCount]);

  const isThrottled = rateLimitRemaining > 0;
  const isDisabled = isLoading || isThrottled;

  const handleAsk = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed || isDisabled) return;
    onAskQuestion(trimmed);
    setQuestion('');
  }, [question, isDisabled, onAskQuestion]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleAsk();
      }
    },
    [handleAsk]
  );

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        backgroundColor: '#1e1e2e',
        border: '1px solid #313244',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        fontSize: '0.875rem',
        color: '#cdd6f4',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          backgroundColor: '#181825',
          borderBottom: '1px solid #313244',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: '700', color: '#89b4fa', fontSize: '0.875rem' }}>
          AI Assistant
        </span>
        <button
          onClick={onClearConversation}
          style={{ ...smBtnStyle, color: '#f38ba8', borderColor: '#f38ba855' }}
          title="Clear conversation history"
        >
          Clear
        </button>
      </div>

      {/* Conversation history */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          minHeight: 0,
        }}
        aria-live="polite"
        aria-label="Conversation history"
      >
        {interactions.length === 0 && !isLoading && (
          <p style={{ color: '#585b70', fontSize: '0.82rem', textAlign: 'center', marginTop: '2rem' }}>
            Ask a question, request a hint, or evaluate your approach.
          </p>
        )}

        {interactions.map((interaction, idx) => (
          <div key={idx}>
            {/* User turn (if there was a question) */}
            {interaction.question && (
              <div style={{ marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.15rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#cba6f7' }}>
                    You
                  </span>
                  <span style={{ fontSize: '0.67rem', color: '#585b70' }}>
                    {formatTime(interaction.timestamp)}
                  </span>
                </div>
                <p style={{ margin: 0, color: '#cdd6f4', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {interaction.question}
                </p>
              </div>
            )}

            {/* Assistant turn */}
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#89b4fa' }}>
                  AI Assistant
                </span>
                <span style={{ fontSize: '0.67rem', color: '#585b70' }}>
                  {formatTime(interaction.timestamp)}
                  {' · '}
                  {interaction.mode}
                  {' · '}
                  {interaction.hintLevel}
                </span>
              </div>
              <AssistantMessage response={interaction.response} />
            </div>

            {idx < interactions.length - 1 && (
              <hr style={{ border: 'none', borderTop: '1px solid #313244', margin: '0.5rem 0 0 0' }} />
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#89b4fa' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid currentColor',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.75s linear infinite',
              }}
            />
            <span style={{ fontSize: '0.82rem' }}>Thinking…</span>
          </div>
        )}

        <div ref={conversationEndRef} />
      </div>

      {/* Controls */}
      <div
        style={{
          flexShrink: 0,
          backgroundColor: '#181825',
          borderTop: '1px solid #313244',
          padding: '0.6rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {/* Question input */}
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value.slice(0, 2000))}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Ctrl+Enter to send)"
          maxLength={2000}
          rows={3}
          disabled={isDisabled}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: '#1e1e2e',
            border: '1px solid #45475a',
            borderRadius: '0.375rem',
            color: '#cdd6f4',
            fontSize: '0.82rem',
            padding: '0.4rem 0.6rem',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            opacity: isDisabled ? 0.6 : 1,
          }}
          aria-label="Question input"
        />

        {/* Send button row */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleAsk}
            disabled={isDisabled || !question.trim()}
            style={{
              ...actionBtnStyle,
              backgroundColor: '#89b4fa',
              color: '#1e1e2e',
              opacity: isDisabled || !question.trim() ? 0.4 : 1,
            }}
          >
            Ask
          </button>
          <button
            onClick={onAskHint}
            disabled={isDisabled}
            style={{ ...actionBtnStyle, opacity: isDisabled ? 0.4 : 1 }}
          >
            Get hint
          </button>
          <button
            onClick={onExplainError}
            disabled={isDisabled}
            style={{ ...actionBtnStyle, opacity: isDisabled ? 0.4 : 1 }}
          >
            Explain error
          </button>
          <button
            onClick={onEvaluate}
            disabled={isDisabled}
            style={{ ...actionBtnStyle, opacity: isDisabled ? 0.4 : 1 }}
          >
            Evaluate approach
          </button>
        </div>

        {/* Rate limit warning */}
        {isThrottled && !isLoading && (
          <p
            style={{ fontSize: '0.72rem', color: '#f9e2af', margin: 0 }}
            aria-live="polite"
          >
            Please wait {rateLimitRemaining}s before asking again
          </p>
        )}

        {/* Hint level */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#a6adc8', whiteSpace: 'nowrap' }}>
            Hint level:
          </span>
          {HINT_LEVELS.map(level => (
            <label
              key={level.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                color: hintLevel === level.value ? '#89b4fa' : '#a6adc8',
              }}
            >
              <input
                type="radio"
                name="hintLevel"
                value={level.value}
                checked={hintLevel === level.value}
                onChange={() => onChangeHintLevel(level.value)}
                style={{ accentColor: '#89b4fa' }}
              />
              {level.label}
            </label>
          ))}
        </div>

        {/* Auto hints + objective toggles */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={autoHintsEnabled}
              onChange={onToggleAutoHints}
              style={{ accentColor: '#89b4fa' }}
            />
            <span style={{ color: autoHintsEnabled ? '#a6e3a1' : '#a6adc8' }}>
              Auto hints
            </span>
          </label>

          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={includeObjective}
              onChange={onToggleIncludeObjective}
              style={{ accentColor: '#89b4fa' }}
            />
            <span style={{ color: '#a6adc8' }}>Include lab objective</span>
          </label>
        </div>

        {/* Char count */}
        {question.length > 0 && (
          <p style={{ fontSize: '0.67rem', color: '#585b70', margin: 0, textAlign: 'right' }}>
            {question.length}/2000
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const smBtnStyle: React.CSSProperties = {
  padding: '0.2rem 0.5rem',
  border: '1px solid #45475a',
  borderRadius: '0.25rem',
  background: 'transparent',
  color: '#cdd6f4',
  fontSize: '0.72rem',
  cursor: 'pointer',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '0.3rem 0.65rem',
  border: '1px solid #45475a',
  borderRadius: '0.375rem',
  background: '#313244',
  color: '#cdd6f4',
  fontSize: '0.78rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontWeight: '500',
};
