export function hexToRgba(hex, alpha) {
  const cleaned = hex.replace("#", "").trim();
  const full = cleaned.length === 3
    ? cleaned
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : cleaned;

  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function createPreviewVariants(palette) {
  const bg = normalizeHex(palette?.bg, "#f4f5fa");
  const primary = normalizeHex(palette?.primary, "#4f6fdb");
  const accent = normalizeHex(palette?.accent, "#ff7aa2");
  const text = normalizeHex(palette?.text, "#111827");

  const primarySoft = adjustHex(primary, { s: -0.14, l: 0.16 });
  const primaryStrong = adjustHex(primary, { s: 0.08, l: -0.13 });
  const accentSoft = adjustHex(accent, { s: -0.16, l: 0.15 });
  const accentStrong = adjustHex(accent, { s: 0.07, l: -0.1 });

  return {
    bg,
    primary,
    accent,
    text,
    primarySoft,
    primaryStrong,
    accentSoft,
    accentStrong,
    surface1: mixHex(bg, primary, 0.1),
    surface2: mixHex(bg, accent, 0.14),
    outline: mixHex(text, bg, 0.72),
    gridLine: mixHex(text, bg, 0.82),
    link: adjustHex(primary, { s: 0.06, l: -0.07 }),
    linkHover: adjustHex(accent, { s: 0.08, l: -0.06 }),
    ctaBg: primaryStrong,
    ctaHover: mixHex(primaryStrong, accentStrong, 0.22),
    kpiTrend: mixHex(primaryStrong, accentStrong, 0.35),
    tagBg: mixHex(accentSoft, bg, 0.3),
  };
}

export function toSwatches(palette) {
  return [
    {
      role: "Background",
      value: palette.bg,
      chipStyle: { background: palette.bg },
    },
    {
      role: "Primary",
      value: palette.primary,
      chipStyle: { background: palette.primary },
    },
    {
      role: "Accent",
      value: palette.accent,
      chipStyle: { background: palette.accent },
    },
    {
      role: "Text",
      value: palette.text,
      chipStyle: { background: palette.text },
    },
  ];
}

function normalizeHex(value, fallback) {
  const parsed = hexToRgb(value);
  if (!parsed) {
    return fallback;
  }
  return rgbToHex(parsed);
}

function mixHex(leftHex, rightHex, rightWeight) {
  const left = hexToRgb(leftHex);
  const right = hexToRgb(rightHex);
  if (!left || !right) {
    return leftHex;
  }

  const weight = clamp(rightWeight, 0, 1);
  return rgbToHex({
    r: Math.round(left.r * (1 - weight) + right.r * weight),
    g: Math.round(left.g * (1 - weight) + right.g * weight),
    b: Math.round(left.b * (1 - weight) + right.b * weight),
  });
}

function adjustHex(hex, { h = 0, s = 0, l = 0 }) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }

  const hsl = rgbToHsl(rgb);
  return rgbToHex(
    hslToRgb({
      h: (hsl.h + h + 360) % 360,
      s: clamp(hsl.s + s, 0, 1),
      l: clamp(hsl.l + l, 0, 1),
    }),
  );
}

function hexToRgb(hex) {
  if (typeof hex !== "string") {
    return null;
  }

  const cleaned = hex.replace("#", "").trim();
  const full = cleaned.length === 3
    ? cleaned
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : cleaned;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }

  const value = Number.parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(rgb) {
  const toHex = (channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToRgb(hsl) {
  const hue = ((hsl.h % 360) + 360) % 360;
  const saturation = clamp(hsl.s, 0, 1);
  const lightness = clamp(hsl.l, 0, 1);

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = chroma;
  } else if (hue < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
