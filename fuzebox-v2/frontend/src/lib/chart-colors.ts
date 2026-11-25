/** Continuous score scales (light red → amber → green). */
export const SCORE_SCALE = ["#FEE2E2", "#FEF3C7", "#DCFCE7"] as const;

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  };
  const c1 = parse(a);
  const c2 = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(c1.r, c2.r)}, ${mix(c1.g, c2.g)}, ${mix(c1.b, c2.b)})`;
}

/** Interpolate across SCORE_SCALE for values in [min, max]. */
export function scoreGradientColor(
  value: number,
  min: number,
  max: number,
): string {
  const t = max > min ? (value - min) / (max - min) : 0.5;
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.5) {
    return mixHex(SCORE_SCALE[0], SCORE_SCALE[1], clamped * 2);
  }
  return mixHex(SCORE_SCALE[1], SCORE_SCALE[2], (clamped - 0.5) * 2);
}

/** Stronger fill on bar hover (Plotly-style emphasis). */
export function emphasizeBarColor(color: string): string {
  const rgba = color.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/,
  );
  if (rgba) {
    const alpha = Math.min(1, parseFloat(rgba[4]) + 0.28);
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${alpha})`;
  }
  const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb) {
    return mixHex(
      `#${Number(rgb[1]).toString(16).padStart(2, "0")}${Number(rgb[2]).toString(16).padStart(2, "0")}${Number(rgb[3]).toString(16).padStart(2, "0")}`,
      "#ffffff",
      0.12,
    );
  }
  if (color.startsWith("#")) {
    return mixHex(color, "#ffffff", 0.12);
  }
  return color;
}
