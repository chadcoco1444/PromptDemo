import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChipGroup } from '../../../src/components/history/ChipGroup';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
] as const;

describe('ChipGroup', () => {
  it('renders all options', () => {
    render(<ChipGroup label="Status" options={OPTIONS} value={null} onChange={vi.fn()} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('marks the selected option with aria-pressed=true', () => {
    render(<ChipGroup label="Status" options={OPTIONS} value="done" onChange={vi.fn()} />);
    const done = screen.getByRole('button', { name: /^done$/i });
    expect(done.getAttribute('aria-pressed')).toBe('true');
    const all = screen.getByRole('button', { name: /^all$/i });
    expect(all.getAttribute('aria-pressed')).toBe('false');
  });

  it('treats "All" as null in onChange', () => {
    const onChange = vi.fn();
    render(<ChipGroup label="Status" options={OPTIONS} value="done" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('emits the value string when a non-All chip is clicked', () => {
    const onChange = vi.fn();
    render(<ChipGroup label="Status" options={OPTIONS} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^failed$/i }));
    expect(onChange).toHaveBeenCalledWith('failed');
  });
});
