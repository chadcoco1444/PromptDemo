import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgressBar } from '../../src/components/ProgressBar';
import { StageLabel } from '../../src/components/StageLabel';
import { ErrorCard } from '../../src/components/ErrorCard';
import { VideoResult } from '../../src/components/VideoResult';

describe('ProgressBar', () => {
  it('renders clamped percentage', () => {
    render(<ProgressBar pct={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
  it('handles negative', () => {
    render(<ProgressBar pct={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('StageLabel', () => {
  it('shows Starting… for null stage', () => {
    render(<StageLabel stage={null} />);
    expect(screen.getByText(/starting/i)).toBeInTheDocument();
  });
  it('shows render label', () => {
    render(<StageLabel stage="render" />);
    expect(screen.getByText(/rendering/i)).toBeInTheDocument();
  });
});

describe('ErrorCard', () => {
  it('shows a friendly headline + collapsible code/message details', async () => {
    const user = userEvent.setup();
    render(<ErrorCard code="CRAWL_FAILED" message="boom" retryable={false} />);
    // Friendly headline is user-visible by default
    expect(screen.getByText(/couldn.?t read your URL/i)).toBeInTheDocument();
    // Code + message live in the collapsible panel; expand + verify
    await user.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText('CRAWL_FAILED')).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
  it('shows "Try again" button when retryable + onRetry provided', () => {
    render(<ErrorCard code="X" message="y" retryable={true} onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('VideoResult', () => {
  it('shows video element + download link with resolved URL', () => {
    const { container } = render(<VideoResult videoUrl="s3://b/v.mp4" resolvedUrl="http://cdn/v.mp4" />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('http://cdn/v.mp4');
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', 'http://cdn/v.mp4');
  });
});
