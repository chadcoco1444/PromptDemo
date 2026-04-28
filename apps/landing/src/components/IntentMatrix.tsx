import { INTENT_MATRIX, type IntentMatrixCell } from '../data/intentMatrix';

export function IntentMatrix() {
  // Group cells by URL → 2 rows × 3 columns
  const byUrl = INTENT_MATRIX.reduce<Record<string, IntentMatrixCell[]>>((acc, cell) => {
    (acc[cell.url] ??= []).push(cell);
    return acc;
  }, {});

  return (
    <section className="py-24 bg-gray-900 text-white px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Behind each video — the storyboard the AI built.
        </h2>
        <p className="text-xl text-gray-400 text-center mb-16 max-w-3xl mx-auto">
          Same URLs as the showcase above. Different intents pull different scene types, different counts, different pacing.
        </p>
        {Object.entries(byUrl).map(([url, cells]) => (
          <div key={url} className="mb-16">
            <h3 className="text-2xl font-semibold mb-2">{cells[0]!.brandName}</h3>
            <p className="text-sm text-gray-500 mb-6 break-all">{url}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cells.map((cell) => (
                <article
                  key={cell.intent}
                  className="border border-gray-700 rounded-lg p-6 hover:border-purple-500 transition"
                >
                  <div className="text-sm uppercase tracking-wide text-gray-400 flex items-center gap-2">
                    <span>{cell.intentEmoji}</span>
                    <span>{cell.intentLabel}</span>
                  </div>
                  <div className="mt-3 text-2xl font-bold">
                    {cell.sceneCount} scenes
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    avg {cell.avgPaceSec}s per scene
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1">
                    {cell.sceneSequence.map((scene, i) => (
                      <span
                        key={i}
                        className="bg-gray-800 text-xs px-2 py-1 rounded font-mono"
                      >
                        {scene}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-gray-400 italic">{cell.notes}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
