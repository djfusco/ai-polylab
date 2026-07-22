import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalBuffer } from '../lib/terminal-buffer';

describe('TerminalBuffer', () => {
  let buf: TerminalBuffer;
  beforeEach(() => { buf = new TerminalBuffer(); });

  it('adds events and respects 2000 event limit', () => {
    for (let i = 0; i < 2100; i++) {
      buf.addOutput(`line ${i}\n`);
    }
    expect(buf.getState().events.length).toBeLessThanOrEqual(2000);
  });

  it('respects 100k transcript char limit', () => {
    for (let i = 0; i < 200; i++) {
      buf.addOutput('x'.repeat(1000));
    }
    expect(buf.getState().transcript.length).toBeLessThanOrEqual(100_000);
  });

  it('respects 50 command limit', () => {
    for (let i = 0; i < 60; i++) {
      buf.addCommand(`command${i}`);
    }
    expect(buf.getState().commands.length).toBeLessThanOrEqual(50);
  });

  it('getRecentTranscript respects maxChars', () => {
    buf.addOutput('a'.repeat(5000));
    const recent = buf.getRecentTranscript(1000);
    expect(recent.length).toBeLessThanOrEqual(1000);
  });

  it('getRecentCommands returns last N commands', () => {
    for (let i = 0; i < 10; i++) buf.addCommand(`cmd${i}`);
    const recent = buf.getRecentCommands(3);
    expect(recent.length).toBe(3);
    expect(recent[recent.length - 1].command).toBe('cmd9');
  });

  it('tracks commandCount', () => {
    buf.addCommand('ls');
    buf.addCommand('pwd');
    expect(buf.getCommandCount()).toBe(2);
  });

  it('clear resets all state', () => {
    buf.addCommand('ls');
    buf.addOutput('some output');
    buf.clear();
    expect(buf.getState().commands.length).toBe(0);
    expect(buf.getState().transcript).toBe('');
    expect(buf.getCommandCount()).toBe(0);
  });
});
