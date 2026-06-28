// Convert a numeric series into an SVG polyline points string, matching the
// prototype's makeSpark() geometry (viewBox 0 0 100 26, 2px vertical padding).

const W = 100;
const H = 26;

export function sparkLine(values: number[]): string {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    // Flat line in the middle when we only have one sample.
    const y = (H / 2).toFixed(1);
    return `0,${y} ${W},${y}`;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = Math.max(1, max - min);
  return pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = H - ((p - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Direction of a series: true when last >= first. */
export function isUp(values: number[]): boolean {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return true;
  return pts[pts.length - 1] >= pts[0];
}
