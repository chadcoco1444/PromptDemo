export interface VideoResultProps {
  videoUrl: string;
  resolvedUrl: string; // same URL but resolved to HTTP (via api base or direct S3 http)
}

export function VideoResult({ videoUrl, resolvedUrl }: VideoResultProps) {
  return (
    <div className="space-y-3">
      <video src={resolvedUrl} controls className="w-full rounded-lg bg-gray-900" />
      <div className="flex gap-3">
        <a
          href={resolvedUrl}
          download
          className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 active:scale-[0.98] transition-all duration-150"
        >
          Download MP4
        </a>
        <code className="text-xs text-gray-500 dark:text-gray-400 self-center break-all">{videoUrl}</code>
      </div>
    </div>
  );
}
