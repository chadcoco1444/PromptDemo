import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobForm } from '../../src/components/JobForm';

const onSubmit = vi.fn().mockResolvedValue({ jobId: 'j1' });

beforeEach(() => {
  onSubmit.mockClear();
});

describe('JobForm', () => {
  it('renders url, intent, duration fields', () => {
    render(<JobForm onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/intent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
  });

  it('calls onSubmit with parsed values', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/intent/i), 'show features');
    await user.selectOptions(screen.getByLabelText(/duration/i), '30');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      url: 'https://example.com',
      intent: 'show features',
      duration: 30,
    });
  });

  it('shows validation error on bad URL', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/url/i), 'not-a-url');
    await user.type(screen.getByLabelText(/intent/i), 'x');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/valid url/i)).toBeInTheDocument();
  });

  it('disables submit while pending', async () => {
    const user = userEvent.setup();
    let resolve!: (v: { jobId: string }) => void;
    const slow = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    render(<JobForm onSubmit={slow} />);
    await user.type(screen.getByLabelText(/url/i), 'https://x.com');
    await user.type(screen.getByLabelText(/intent/i), 'x');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(screen.getByRole('button')).toBeDisabled();
    resolve({ jobId: 'j1' });
  });
});
