import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineageBadge } from '../../../src/components/history/LineageBadge';

const HOUR_AGO = Date.now() - 60 * 60 * 1000;

describe('LineageBadge', () => {
  it('renders nothing when parent is null', () => {
    const { container } = render(
      <LineageBadge parent={null} currentUrl="https://vercel.com" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows "from <parent-hostname>" when hostnames differ', () => {
    render(
      <LineageBadge
        parent={{ jobId: 'parent-1', hostname: 'https://stripe.com', createdAt: HOUR_AGO }}
        currentUrl="https://vercel.com"
      />,
    );
    expect(screen.getByText(/from stripe\.com/i)).toBeInTheDocument();
  });

  it('shows "regenerated <relative-time>" when hostnames match (case-insensitive, www. stripped)', () => {
    render(
      <LineageBadge
        parent={{ jobId: 'parent-1', hostname: 'https://www.VERCEL.com', createdAt: HOUR_AGO }}
        currentUrl="https://vercel.com/dashboard"
      />,
    );
    expect(screen.getByText(/regenerated/i)).toBeInTheDocument();
    expect(screen.getByText(/h ago|hour/i)).toBeInTheDocument();
  });

  it('links to /jobs/<parentJobId>', () => {
    render(
      <LineageBadge
        parent={{ jobId: 'parent-1', hostname: 'https://stripe.com', createdAt: HOUR_AGO }}
        currentUrl="https://vercel.com"
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/jobs/parent-1');
  });
});
