import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchInput } from '../../../src/components/history/SearchInput';

describe('SearchInput', () => {
  it('renders with the initial value', () => {
    render(<SearchInput value="hello" onChange={vi.fn()} />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('hello');
  });

  it('debounces onChange by 300ms', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'h' } });
    fireEvent.change(input, { target: { value: 'hi' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('hi');
    vi.useRealTimers();
  });

  it('Enter flushes immediately (skips debounce)', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'fast' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('fast');
    vi.useRealTimers();
  });

  it('Escape clears + flushes empty', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput value="hello" onChange={onChange} />);
    const input = screen.getByRole('searchbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
    vi.useRealTimers();
  });

  it('Clear button only renders when there is content; clicking flushes empty', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
    rerender(<SearchInput value="hi" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith('');
    vi.useRealTimers();
  });
});
