import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadMoreButton } from '../../../src/components/history/LoadMoreButton';

describe('LoadMoreButton', () => {
  it('renders idle state with copy and is enabled', () => {
    render(<LoadMoreButton state="idle" onClick={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toMatch(/load.*more/i);
  });

  it('disables the button + shows Loading copy when state=pending', () => {
    render(<LoadMoreButton state="pending" onClick={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/loading/i);
  });

  it('does not render a button when state=end (renders the end-of-list link instead)', () => {
    render(<LoadMoreButton state="end" onClick={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/create');
    expect(link.textContent).toMatch(/end|make more/i);
  });

  it('idle click invokes onClick', () => {
    const onClick = vi.fn();
    render(<LoadMoreButton state="idle" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
