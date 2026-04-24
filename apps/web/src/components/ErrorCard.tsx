export interface ErrorCardProps {
  code: string;
  message: string;
  retryable: boolean;
  onRetry?: () => void;
}

export function ErrorCard({ code, message, retryable, onRetry }: ErrorCardProps) {
  return (
    <div className="rounded border border-red-300 bg-red-50 p-4 space-y-2">
      <div className="font-medium text-red-800">Something went wrong</div>
      <div className="text-sm text-red-700">
        <span className="font-mono">{code}</span>: {message}
      </div>
      {retryable && onRetry ? (
        <button onClick={onRetry} className="text-sm underline text-red-700">
          Retry
        </button>
      ) : null}
    </div>
  );
}
