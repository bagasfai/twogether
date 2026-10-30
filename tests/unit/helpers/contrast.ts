export type Rgb = { r: number; g: number; b: number };
export type Token = { l: number; c: number; h: number; alpha: number };

export function parseTokens(css: string, block: ":root" | ".dark"): Record<string, Token> {
  const start = css.indexOf(`${block} {`);
  if (start === -1) throw new Error(`block ${block} not found`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const out: Record<string, Token> = {};
  const re = /--([\w-]+):\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%)?\s*\)/g;
  for (const m of body.matchAll(re)) {
    out[m[1]] = {
      l: Number(m[2]) / 100,
      c: Number(m[3]),
      h: Number(m[4]),
      alpha: m[5] === undefined ? 1 : Number(m[5]) / 100,
    };
  }
  return out;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

// Linear-light sRGB channels in 0..1.
export function toRgb(t: Token): Rgb {
  const hr = (t.h * Math.PI) / 180;
  const a = t.c * Math.cos(hr);
  const b = t.c * Math.sin(hr);
  const l_ = t.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = t.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = t.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

// Blend in linear light (approximation of compositing; adequate for tint checks).
export function blend(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

const luminance = (c: Rgb) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
