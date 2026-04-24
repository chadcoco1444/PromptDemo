export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={clamped}>
      <div className="bg-brand-500 h-2 transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}
