/** Compare observed geometry on overlapping ball-position cells, independent of game-flow exposure. */
export type GeometryCell = { n: number; values: number[] };
export function matchedGeometry(a: Record<string, GeometryCell>, b: Record<string, GeometryCell>, phase: string, column: number) {
  let weighted = 0, sharedSamples = 0, cells = 0;
  let firstSamples = 0, secondSamples = 0;
  for (const [key, cell] of Object.entries(a)) if (key.startsWith(`${phase}|`)) firstSamples += cell.n;
  for (const [key, cell] of Object.entries(b)) if (key.startsWith(`${phase}|`)) secondSamples += cell.n;
  for (const [key, first] of Object.entries(a)) {
    const second = b[key];
    if (!key.startsWith(`${phase}|`) || first.n < 25 || !second || second.n < 25) continue;
    const weight = Math.min(first.n, second.n);
    weighted += weight * (first.values[column] - second.values[column]);
    sharedSamples += weight; cells++;
  }
  return { delta: weighted / Math.max(1, sharedSamples), cells, sharedSamples,
    firstCoverage: sharedSamples / Math.max(1, firstSamples), secondCoverage: sharedSamples / Math.max(1, secondSamples) };
}
