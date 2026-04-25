import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FilterBar } from '../../../src/components/history/FilterBar';

describe('FilterBar', () => {
  it('renders search input + status/duration/time chip groups', () => {
    render(<FilterBar query={{}} onChange={vi.fn()} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /duration/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /time/i })).toBeInTheDocument();
  });

  it('clicking a status chip emits onChange with status set', () => {
    const onChange = vi.fn();
    render(<FilterBar query={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
  });

  it('clicking the All chip in a group clears that filter', () => {
    const onChange = vi.fn();
    render(<FilterBar query={{ status: 'done' }} onChange={onChange} />);
    const statusGroup = screen.getByRole('group', { name: /status/i });
    const allChip = within(statusGroup).getByRole('button', { name: /^all$/i });
    fireEvent.click(allChip);
    expect(onChange).toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }));
  });
});
