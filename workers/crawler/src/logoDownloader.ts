export async function downloadLogo(src: string): Promise<Buffer | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 512_000) return null; // guard
    return buf;
  } catch {
    return null;
  }
}
