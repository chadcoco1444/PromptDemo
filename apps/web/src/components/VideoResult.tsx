export interface VideoResultProps {
  videoUrl: string;
  resolvedUrl: string; // same URL but resolved to HTTP (via api base or direct S3 http)
}

export function VideoResult({ videoUrl, resolvedUrl }: VideoResultProps) {
  return (
    <div className="space-y-3">
      <video src={resolvedUrl} controls className="w-full rounded" />
      <div className="flex gap-3">
        <a
          href={resolvedUrl}
          download
          className="bg-brand-500 hover:bg-brand-700 text-white px-4 py-2 rounded text-sm"
        >
          Download MP4
        </a>
        <code className="text-xs text-slate-500 self-center break-all">{videoUrl}</code>
      </div>
    </div>
  );
}
