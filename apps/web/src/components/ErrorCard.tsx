export interface ErrorCardProps {
  code: string;
  message: string;
  retryable: boolean;
  onRetry?: () => void;
}

export function ErrorCard({ code, message, retryable, onRetry }: ErrorCardProps) {
  return (
    <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4 space-y-2">
      <div className="font-medium text-red-800 dark:text-red-300">Something went wrong</div>
      <div className="text-sm text-red-700 dark:text-red-400">
        <span className="font-mono">{code}</span>: {message}
      </div>
      {retryable && onRetry ? (
        <button
          onClick={onRetry}
          className="text-sm underline text-red-700 dark:text-red-400 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 rounded"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
