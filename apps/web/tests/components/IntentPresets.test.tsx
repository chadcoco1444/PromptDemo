import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntentPresets } from '../../src/components/IntentPresets';
import { INTENT_PRESETS } from '../../src/lib/intentPresets';

const onSelect = vi.fn();

beforeEach(() => {
  onSelect.mockReset();
});

describe('IntentPresets', () => {
  it('renders one button per preset', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    expect(screen.getAllByRole('button')).toHaveLength(INTENT_PRESETS.length);
  });

  it('renders English labels when locale="en"', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /executive summary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tutorial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marketing hype/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /technical deep-dive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer success/i })).toBeInTheDocument();
  });

  it('renders Chinese labels when locale="zh"', () => {
    render(<IntentPresets locale="zh" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /高階主管摘要/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /教學版/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /行銷版/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /技術向/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /客戶案例/ })).toBeInTheDocument();
  });

  it('sets each chip title attribute to the EN preset body when locale="en"', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    const execChip = screen.getByRole('button', { name: /executive summary/i });
    const exec = INTENT_PRESETS.find((p) => p.id === 'executive-summary')!;
    expect(execChip).toHaveAttribute('title', exec.body.en);
  });

  it('sets each chip title attribute to the ZH preset body when locale="zh"', () => {
    render(<IntentPresets locale="zh" onSelect={onSelect} />);
    const execChip = screen.getByRole('button', { name: /高階主管摘要/ });
    const exec = INTENT_PRESETS.find((p) => p.id === 'executive-summary')!;
    expect(execChip).toHaveAttribute('title', exec.body.zh);
  });

  it('calls onSelect with the full preset object when a chip is clicked', async () => {
    const user = userEvent.setup();
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /tutorial/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      INTENT_PRESETS.find((p) => p.id === 'tutorial')
    );
  });

  it('chip buttons have type="button" so they do not submit parent forms', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });
});
