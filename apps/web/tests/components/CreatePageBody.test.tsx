import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/lib/api', () => ({
  createJob: vi.fn().mockResolvedValue({ jobId: 'abc' }),
}));
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CreatePageBody } from '../../src/components/CreatePageBody';

describe('CreatePageBody', () => {
  it('renders the legacy headline + subhead + JobForm', () => {
    render(<CreatePageBody />);
    expect(screen.getByText(/Turn any URL into a demo video/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
  });

  it('hydrates form values from prefill when provided', () => {
    render(<CreatePageBody prefill={{ url: 'https://x.com', intent: 'show pricing', duration: 30 }} />);
    expect((screen.getByLabelText(/url/i) as HTMLInputElement).value).toBe('https://x.com');
    expect((screen.getByLabelText(/intent/i) as HTMLTextAreaElement).value).toBe('show pricing');
  });
});
