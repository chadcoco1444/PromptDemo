export function rescaleFrames(durations: number[], target: number): number[] {
  if (durations.length === 0) throw new Error('rescaleFrames: empty durations');
  const sum = durations.reduce((a, b) => a + b, 0);
  if (sum === target) return [...durations];

  const ratios = durations.map((d) => d / sum);
  const out = durations.map((_, i) => Math.max(1, Math.round(target * ratios[i]!)));
  // Correct rounding residue by adjusting the longest scene
  const rounded = out.reduce((a, b) => a + b, 0);
  const residue = target - rounded;
  if (residue !== 0) {
    const j = out.indexOf(Math.max(...out));
    out[j] = out[j]! + residue;
  }
  if (out.some((n) => n <= 0)) {
    throw new Error(`rescaleFrames: cannot reach target ${target} without non-positive scenes`);
  }
  return out;
}
