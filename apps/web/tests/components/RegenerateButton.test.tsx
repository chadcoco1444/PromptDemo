import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

import { RegenerateButton } from '../../src/components/RegenerateButton';

const onSubmit = vi.fn();

beforeEach(() => {
  pushMock.mockClear();
  onSubmit.mockClear();
});

describe('RegenerateButton', () => {
  it('stays disabled until hint has content', () => {
    render(
      <RegenerateButton
        parentJobId="p1"
        parentInput={{ url: 'https://x.com', duration: 30 }}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeDisabled();
  });

  it('submits with parentJobId + hint, then navigates', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValue({ jobId: 'j2' });
    render(
      <RegenerateButton
        parentJobId="p1"
        parentInput={{ url: 'https://x.com', duration: 30 }}
        onSubmit={onSubmit}
      />
    );
    await user.type(screen.getByRole('textbox'), 'faster pace');
    await user.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ parentJobId: 'p1', hint: 'faster pace', url: 'https://x.com', duration: 30 })
    );
    expect(pushMock).toHaveBeenCalledWith('/jobs/j2');
  });
});
