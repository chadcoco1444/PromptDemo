import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

import { useSession } from 'next-auth/react';
import { PreviewForm } from '../../../src/components/landing/PreviewForm';

describe('PreviewForm', () => {
  const originalLocation = window.location;
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: 'http://localhost:3001/', assign: vi.fn() },
    });
  });

  it('renders the JobForm fields (URL, intent, duration, submit)', () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as never);
    render(<PreviewForm onAuthedSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/intent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create video|try free/i })).toBeInTheDocument();
  });

  it('signed-out submit redirects to /api/auth/signin with prefill in callbackUrl', async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as never);
    const onAuthedSubmit = vi.fn();
    render(<PreviewForm onAuthedSubmit={onAuthedSubmit} />);
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://x.com' } });
    fireEvent.change(screen.getByLabelText(/intent/i), { target: { value: 'show pricing' } });
    fireEvent.click(screen.getByRole('button', { name: /create video|try free/i }));

    await new Promise((res) => setTimeout(res, 0));

    expect(onAuthedSubmit).not.toHaveBeenCalled();
    expect(window.location.href).toMatch(/\/auth\/signin/);
    const params = new URLSearchParams(window.location.href.split('?')[1] ?? '');
    // Only callbackUrl at the top level — prefill must be nested inside it,
    // never leaked as a top-level param.
    expect(params.has('callbackUrl')).toBe(true);
    expect(params.has('prefill')).toBe(false);
    const callback = params.get('callbackUrl');
    expect(callback).toMatch(/^\/create\?prefill=/);
  });

  it('signed-in submit invokes onAuthedSubmit with the form values', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: '1', email: 'a@b' } },
      status: 'authenticated',
    } as never);
    const onAuthedSubmit = vi.fn().mockResolvedValue({ jobId: 'abc' });
    render(<PreviewForm onAuthedSubmit={onAuthedSubmit} />);
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://x.com' } });
    fireEvent.change(screen.getByLabelText(/intent/i), { target: { value: 'show pricing' } });
    fireEvent.click(screen.getByRole('button', { name: /create video|try free/i }));

    await new Promise((res) => setTimeout(res, 0));

    expect(onAuthedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x.com', intent: 'show pricing' }),
    );
  });

  it('does NOT redirect or call onAuthedSubmit while session is loading', async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'loading' } as never);
    const onAuthedSubmit = vi.fn();
    render(<PreviewForm onAuthedSubmit={onAuthedSubmit} />);
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://x.com' } });
    fireEvent.change(screen.getByLabelText(/intent/i), { target: { value: 'show pricing' } });
    fireEvent.click(screen.getByRole('button', { name: /create video|try free/i }));

    await new Promise((res) => setTimeout(res, 0));

    // Critical: neither branch fires while session is still hydrating.
    expect(onAuthedSubmit).not.toHaveBeenCalled();
    // window.location.href should be the original (unchanged) URL.
    expect(window.location.href).toBe('http://localhost:3001/');
  });
});
