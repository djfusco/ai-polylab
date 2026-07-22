import { describe, it, expect, beforeEach } from 'vitest';
import { CommandReconstructor } from '../lib/terminal-reconstruction';

describe('CommandReconstructor', () => {
  let rec: CommandReconstructor;
  beforeEach(() => { rec = new CommandReconstructor(); });

  it('reconstructs simple command on Enter', () => {
    'ls\r'.split('').forEach(c => rec.processByte(c));
    expect(rec.getLastCommand()).toBe('ls');
  });

  it('handles backspace correctly', () => {
    'lss\x08\r'.split('').forEach(c => rec.processByte(c));
    expect(rec.getLastCommand()).toBe('ls');
  });

  it('handles Ctrl+C by resetting current line', () => {
    'ls'.split('').forEach(c => rec.processByte(c));
    rec.processByte('\x03');
    expect(rec.getCurrentLine()).toBe('');
  });

  it('handles pasted commands (multiple chars at once)', () => {
    rec.processByte('file dispatch.bin\r');
    expect(rec.getLastCommand()).toBe('file dispatch.bin');
  });

  it('handles multiple Enter submits correctly', () => {
    'ls\rcd /\r'.split('').forEach(c => rec.processByte(c));
    expect(rec.getCommands()).toContain('ls');
    expect(rec.getCommands()).toContain('cd /');
  });

  it('trims whitespace from commands', () => {
    '  ls  \r'.split('').forEach(c => rec.processByte(c));
    expect(rec.getLastCommand()).toBe('ls');
  });

  it('does not record empty commands', () => {
    '\r\r\r'.split('').forEach(c => rec.processByte(c));
    expect(rec.getCommands()).toHaveLength(0);
  });

  it('handles DEL character (0x7f) as backspace', () => {
    'lx\x7f\r'.split('').forEach(c => rec.processByte(c));
    expect(rec.getLastCommand()).toBe('l');
  });
});
