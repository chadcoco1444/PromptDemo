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
    expect(screen.getByRole('button', { name: /creat/i })).toBeDisabled();
    resolve({ jobId: 'j1' });
  });

  it('renders the 5 intent-preset chips below the intent textarea', () => {
    render(<JobForm onSubmit={onSubmit} />);
    // English labels are the jsdom default (navigator.language === 'en-US').
    expect(screen.getByRole('button', { name: /executive summary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tutorial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marketing hype/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /technical deep-dive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer success/i })).toBeInTheDocument();
  });

  it('clicking a preset chip fills an empty intent textarea with the preset body', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    expect(intent.value).toBe('');

    await user.click(screen.getByRole('button', { name: /executive summary/i }));
    expect(intent.value).toMatch(/emphasize business outcomes/i);
    expect(intent.value).not.toContain('[Preset:'); // fill mode, not append mode
  });

  it('clicking a preset chip appends to non-empty intent with a [Preset: ...] marker', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    await user.type(intent, 'existing user intent');

    await user.click(screen.getByRole('button', { name: /tutorial/i }));
    expect(intent.value).toContain('existing user intent');
    expect(intent.value).toContain('[Preset: Tutorial / Walkthrough]');
    expect(intent.value).toMatch(/walk through the product step-by-step/i);
  });

  it('preset chips do not submit the form', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /marketing hype/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submitting after a preset click sends the merged intent to onSubmit', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/url/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /executive summary/i }));
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0]![0];
    expect(call.intent).toMatch(/emphasize business outcomes/i);
    expect(call.url).toBe('https://example.com');
  });

  it('renders a language toggle button and switches chip labels + tooltips', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);

    // jsdom default navigator.language is 'en-US' → initial locale is 'en'.
    expect(screen.getByRole('button', { name: /executive summary/i })).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /toggle preset language/i });
    await user.click(toggle);

    // After toggle: chip labels flip to zh.
    expect(screen.getByRole('button', { name: /高階主管摘要/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /executive summary/i })).not.toBeInTheDocument();

    // Tooltip also flipped to zh body (contains CJK chars).
    const chip = screen.getByRole('button', { name: /高階主管摘要/ });
    expect(chip.getAttribute('title')).toMatch(/[一-鿿]/);
  });

  it('clicking a chip after toggling to zh fills textarea with ZH body', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /toggle preset language/i }));
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    expect(intent.value).toBe('');

    await user.click(screen.getByRole('button', { name: /高階主管摘要/ }));
    expect(intent.value).toMatch(/[一-鿿]/); // CJK body was spliced in
    expect(intent.value).not.toContain('Emphasize business outcomes'); // NOT the en body
    expect(intent.value).not.toContain('[Preset:'); // fill mode, not append
  });

  it('append mode in zh uses the zh label in the [Preset: ...] marker', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /toggle preset language/i }));
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    await user.type(intent, '既有文字');
    await user.click(screen.getByRole('button', { name: /教學版/ }));

    expect(intent.value).toContain('既有文字');
    expect(intent.value).toContain('[Preset: 教學版]');
    expect(intent.value).not.toContain('[Preset: Tutorial'); // no en marker in zh mode
  });

  it('bilingual dedup: click chip in EN, toggle to zh, click same chip → no duplicate', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;

    // First click in EN — fills textarea with English body
    await user.click(screen.getByRole('button', { name: /executive summary/i }));
    const afterEn = intent.value;
    expect(afterEn).toMatch(/emphasize business outcomes/i);

    // Toggle to zh
    await user.click(screen.getByRole('button', { name: /toggle preset language/i }));
    // Re-click same chip in zh — should NOT append zh body on top of en body
    await user.click(screen.getByRole('button', { name: /高階主管摘要/ }));
    expect(intent.value).toBe(afterEn); // unchanged — bilingual dedup
  });
});
