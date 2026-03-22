import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const FALLBACK_PALETTE = {
  bg: "#EFF3FF",
  primary: "#4F6FDB",
  accent: "#FF7AA2",
  text: "#111827",
};

const MIN_TEXT_BG_CONTRAST = 7.0;
const MIN_TEXT_PRIMARY_CONTRAST = 3.0;
const MIN_PRIMARY_ACCENT_DISTANCE = 22;

/**
 * Generates a deterministic, UI-oriented 4-role palette from an image.
 * The heuristics prioritize polished UI usage over exact image color fidelity.
 */
export async function generateWebsitePaletteFromImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    return FALLBACK_PALETTE;
  }

  try {
    const image = await readPngBitmap(imageUrl);
    const sampledPixels = sampleImagePixels(image);
    if (sampledPixels.length === 0) {
      return FALLBACK_PALETTE;
    }

    const dominantColors = extractDominantColors(sampledPixels);
    const stats = analyzeImageStats(sampledPixels, dominantColors);

    const basePalette = shouldUseFallback(stats, dominantColors)
      ? buildFallbackPalette(stats, dominantColors[0]?.rgb)
      : assignRoleColors(dominantColors, stats);

    const tunedPalette = enforcePaletteQuality(basePalette, dominantColors, stats);
    return {
      bg: rgbToHex(tunedPalette.background),
      primary: rgbToHex(tunedPalette.primary),
      accent: rgbToHex(tunedPalette.accent),
      text: rgbToHex(tunedPalette.text),
    };
  } catch {
    return FALLBACK_PALETTE;
  }
}

async function readPngBitmap(imageUrl) {
  const buffer = await readImageBuffer(imageUrl);
  return PNG.sync.read(buffer);
}

async function readImageBuffer(imageUrl) {
  if (looksLikeHttpUrl(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Image request failed with status ${response.status}.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return readFile(imageUrl);
}

function looksLikeHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function sampleImagePixels(image) {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) {
    return [];
  }

  const targetWidth = 72;
  const targetHeight = 72;
  const stepX = Math.max(1, Math.floor(width / targetWidth));
  const stepY = Math.max(1, Math.floor(height / targetHeight));

  const samples = [];
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const pixelIndex = ((y * width) + x) * 4;
      const alpha = data[pixelIndex + 3];
      if (alpha < 90) {
        continue;
      }

      samples.push({
        r: data[pixelIndex],
        g: data[pixelIndex + 1],
        b: data[pixelIndex + 2],
      });
    }
  }

  return samples;
}

/**
 * Uses coarse quantization to build weighted points, then weighted k-means in Lab.
 */
function extractDominantColors(pixels) {
  const buckets = new Map();

  for (const pixel of pixels) {
    const key = quantizationKey(pixel);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, r: 0, g: 0, b: 0, key };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.r += pixel.r;
    bucket.g += pixel.g;
    bucket.b += pixel.b;
  }

  const points = [...buckets.values()]
    .map((bucket) => {
      const rgb = {
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count),
      };
      return {
        key: bucket.key,
        rgb,
        weight: bucket.count,
        lab: rgbToLab(rgb),
      };
    })
    .sort((left, right) => {
      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }
      return left.key.localeCompare(right.key);
    });

  if (points.length === 0) {
    return [];
  }

  const clusterTarget = chooseClusterCount(points.length);
  const seeds = chooseInitialSeedLabs(points, clusterTarget);
  const clustered = runWeightedLabKMeans(points, seeds, 8);
  const merged = mergeNearbyClusters(clustered, 8);

  return merged.slice(0, 10);
}

function chooseClusterCount(pointCount) {
  if (pointCount >= 14) {
    return 7;
  }
  if (pointCount >= 9) {
    return 6;
  }
  if (pointCount >= 5) {
    return 4;
  }
  return Math.max(2, pointCount);
}

function chooseInitialSeedLabs(points, count) {
  const seeds = [];
  for (const point of points) {
    if (seeds.length >= count) {
      break;
    }

    if (seeds.length === 0) {
      seeds.push(point.lab);
      continue;
    }

    const minDistance = Math.min(...seeds.map((seed) => labDistance(seed, point.lab)));
    if (minDistance >= 16) {
      seeds.push(point.lab);
    }
  }

  if (seeds.length < count) {
    for (const point of points) {
      if (seeds.length >= count) {
        break;
      }
      seeds.push(point.lab);
    }
  }

  return seeds;
}

function runWeightedLabKMeans(points, seedLabs, iterations) {
  let centroids = seedLabs.map((seed) => ({ ...seed }));

  for (let index = 0; index < iterations; index += 1) {
    const accumulators = centroids.map(() => ({
      l: 0,
      a: 0,
      b: 0,
      r: 0,
      g: 0,
      bRgb: 0,
      weight: 0,
    }));

    for (const point of points) {
      const nearestIndex = getNearestLabIndex(point.lab, centroids);
      const accumulator = accumulators[nearestIndex];
      accumulator.l += point.lab.l * point.weight;
      accumulator.a += point.lab.a * point.weight;
      accumulator.b += point.lab.b * point.weight;
      accumulator.r += point.rgb.r * point.weight;
      accumulator.g += point.rgb.g * point.weight;
      accumulator.bRgb += point.rgb.b * point.weight;
      accumulator.weight += point.weight;
    }

    centroids = centroids.map((centroid, centroidIndex) => {
      const accumulator = accumulators[centroidIndex];
      if (accumulator.weight === 0) {
        return centroid;
      }
      return {
        l: accumulator.l / accumulator.weight,
        a: accumulator.a / accumulator.weight,
        b: accumulator.b / accumulator.weight,
      };
    });
  }

  const finalAccumulators = centroids.map(() => ({
    l: 0,
    a: 0,
    b: 0,
    r: 0,
    g: 0,
    bRgb: 0,
    weight: 0,
  }));

  for (const point of points) {
    const nearestIndex = getNearestLabIndex(point.lab, centroids);
    const accumulator = finalAccumulators[nearestIndex];
    accumulator.l += point.lab.l * point.weight;
    accumulator.a += point.lab.a * point.weight;
    accumulator.b += point.lab.b * point.weight;
    accumulator.r += point.rgb.r * point.weight;
    accumulator.g += point.rgb.g * point.weight;
    accumulator.bRgb += point.rgb.b * point.weight;
    accumulator.weight += point.weight;
  }

  return finalAccumulators
    .filter((accumulator) => accumulator.weight > 0)
    .map((accumulator) => {
      const rgb = {
        r: clampChannel(Math.round(accumulator.r / accumulator.weight)),
        g: clampChannel(Math.round(accumulator.g / accumulator.weight)),
        b: clampChannel(Math.round(accumulator.bRgb / accumulator.weight)),
      };
      const lab = {
        l: accumulator.l / accumulator.weight,
        a: accumulator.a / accumulator.weight,
        b: accumulator.b / accumulator.weight,
      };
      const hsl = rgbToHsl(rgb);
      return {
        rgb,
        lab,
        hsl,
        chroma: Math.sqrt(lab.a * lab.a + lab.b * lab.b),
        pop: accumulator.weight,
        hex: rgbToHex(rgb),
      };
    })
    .sort((left, right) => {
      if (right.pop !== left.pop) {
        return right.pop - left.pop;
      }
      return left.hex.localeCompare(right.hex);
    });
}

function mergeNearbyClusters(clusters, threshold) {
  const merged = [];

  for (const cluster of clusters) {
    const matchIndex = merged.findIndex((candidate) => labDistance(candidate.lab, cluster.lab) < threshold);
    if (matchIndex === -1) {
      merged.push({ ...cluster });
      continue;
    }

    const match = merged[matchIndex];
    const totalWeight = match.pop + cluster.pop;
    match.rgb = {
      r: clampChannel(Math.round((match.rgb.r * match.pop + cluster.rgb.r * cluster.pop) / totalWeight)),
      g: clampChannel(Math.round((match.rgb.g * match.pop + cluster.rgb.g * cluster.pop) / totalWeight)),
      b: clampChannel(Math.round((match.rgb.b * match.pop + cluster.rgb.b * cluster.pop) / totalWeight)),
    };
    match.lab = {
      l: (match.lab.l * match.pop + cluster.lab.l * cluster.pop) / totalWeight,
      a: (match.lab.a * match.pop + cluster.lab.a * cluster.pop) / totalWeight,
      b: (match.lab.b * match.pop + cluster.lab.b * cluster.pop) / totalWeight,
    };
    match.pop = totalWeight;
    match.hsl = rgbToHsl(match.rgb);
    match.chroma = Math.sqrt(match.lab.a * match.lab.a + match.lab.b * match.lab.b);
    match.hex = rgbToHex(match.rgb);
  }

  return merged.sort((left, right) => {
    if (right.pop !== left.pop) {
      return right.pop - left.pop;
    }
    return left.hex.localeCompare(right.hex);
  });
}

function analyzeImageStats(pixels, dominantColors) {
  let sumL = 0;
  let sumS = 0;
  let sumSqL = 0;
  let minL = 100;
  let maxL = 0;

  for (const pixel of pixels) {
    const lab = rgbToLab(pixel);
    const hsl = rgbToHsl(pixel);
    sumL += lab.l;
    sumSqL += lab.l * lab.l;
    sumS += hsl.s;
    minL = Math.min(minL, lab.l);
    maxL = Math.max(maxL, lab.l);
  }

  const count = Math.max(1, pixels.length);
  const avgL = sumL / count;
  const avgS = sumS / count;
  const varianceL = Math.max(0, sumSqL / count - avgL * avgL);
  const stdL = Math.sqrt(varianceL);

  return {
    avgL,
    avgS,
    minL,
    maxL,
    stdL,
    colorCount: dominantColors.length,
  };
}

function shouldUseFallback(stats, dominantColors) {
  if (dominantColors.length < 3) {
    return true;
  }

  const lowSaturation = stats.avgS < 0.08;
  const lowContrast = stats.maxL - stats.minL < 16;
  if (lowSaturation && lowContrast) {
    return true;
  }

  return stats.stdL < 6 && stats.avgS < 0.12;


}

function assignRoleColors(colors, stats) {
  const backgroundCandidate = pickBestColor(colors, (color) => scoreBackground(color));
  const background = softenBackgroundColor(
    backgroundCandidate?.rgb ?? buildFallbackPalette(stats, colors[0]?.rgb).background,
    stats,
  );

  const backgroundLab = rgbToLab(background);
  const primaryCandidate = pickBestColor(
    colors.filter((color) => color.hex !== backgroundCandidate?.hex),
    (color) => scorePrimary(color, backgroundLab),
  );
  const primary = tunePrimaryColor(
    primaryCandidate?.rgb ?? buildFallbackPalette(stats, colors[0]?.rgb).primary,
    background,
  );

  const primaryMetrics = summarizeRgb(primary);
  const accentCandidate = pickBestColor(
    colors.filter((color) => color.hex !== primaryCandidate?.hex && color.hex !== backgroundCandidate?.hex),
    (color) => scoreAccent(color, primaryMetrics, backgroundLab),
  );
  const accent = tuneAccentColor(
    accentCandidate?.rgb ?? deriveAccentFromPrimary(primary),
    primary,
    background,
  );

  const text = chooseReadableTextColor(background, primary, accent, colors);

  return {
    background,
    primary,
    accent,
    text,
  };
}

function scoreBackground(color) {
  const lightnessPenalty = Math.abs(color.lab.l - 92) * 1.7;
  const saturationPenalty = Math.max(0, color.hsl.s - 0.28) * 80;
  const darkPenalty = color.lab.l < 68 ? (68 - color.lab.l) * 3 : 0;
  const chromaPenalty = color.chroma * 0.4;
  const populationBonus = Math.log10(color.pop + 1) * 8;
  return populationBonus - lightnessPenalty - saturationPenalty - darkPenalty - chromaPenalty;
}

function scorePrimary(color, backgroundLab) {
  const saturationBonus = color.hsl.s * 52;
  const chromaBonus = color.chroma * 0.8;
  const lightnessPenalty = Math.abs(color.lab.l - 52) * 1.2;
  const neutralPenalty = color.hsl.s < 0.18 ? 20 : 0;
  const distanceBonus = Math.min(65, labDistance(color.lab, backgroundLab)) * 0.45;
  const populationBonus = Math.log10(color.pop + 1) * 7;
  return saturationBonus + chromaBonus + distanceBonus + populationBonus - lightnessPenalty - neutralPenalty;
}

function scoreAccent(color, primaryMetrics, backgroundLab) {
  const hueDistanceBonus = hueDistance(color.hsl.h, primaryMetrics.hsl.h) * 0.52;
  const colorDistanceBonus = Math.min(70, labDistance(color.lab, primaryMetrics.lab)) * 0.9;
  const saturationBonus = color.hsl.s * 50;
  const chromaBonus = color.chroma * 0.65;
  const primarySimilarityPenalty = labDistance(color.lab, primaryMetrics.lab) < 18 ? 25 : 0;
  const backgroundDistancePenalty = labDistance(color.lab, backgroundLab) < 14 ? 18 : 0;
  const lightnessPenalty = Math.abs(color.lab.l - 58) * 0.6;
  const yellowPrimaryGreenPenalty = isWarmYellowHue(primaryMetrics.hsl.h) && isGreenishHue(color.hsl.h)
    ? 26
    : 0;
  return (
    hueDistanceBonus
    + colorDistanceBonus
    + saturationBonus
    + chromaBonus
    - primarySimilarityPenalty
    - backgroundDistancePenalty
    - lightnessPenalty
    - yellowPrimaryGreenPenalty
  );
}

function buildFallbackPalette(stats, seedRgb) {
  const seed = seedRgb ?? hexToRgb(FALLBACK_PALETTE.primary);
  const seedHsl = rgbToHsl(seed);
  const baseHue = Number.isFinite(seedHsl.h) ? seedHsl.h : 224;

  const backgroundLightness = stats.avgL < 35 ? 0.92 : 0.95;
  const background = hslToRgb({
    h: baseHue,
    s: 0.2,
    l: backgroundLightness,
  });
  const primary = hslToRgb({
    h: baseHue,
    s: 0.62,
    l: 0.48,
  });
  const accent = hslToRgb({
    h: deriveAccentHueFromPrimaryHue(baseHue),
    s: 0.72,
    l: 0.57,
  });
  const text = chooseReadableTextColor(background, primary, accent, []);

  return { background, primary, accent, text };
}

function enforcePaletteQuality(palette, colors, stats) {
  let background = { ...palette.background };
  let primary = { ...palette.primary };
  let accent = { ...palette.accent };
  let text = { ...palette.text };

  if (labDistance(rgbToLab(primary), rgbToLab(accent)) < MIN_PRIMARY_ACCENT_DISTANCE) {
    accent = deriveAccentFromPrimary(primary);
    accent = tuneAccentColor(accent, primary, background);
  }

  if (contrastRatio(text, background) < MIN_TEXT_BG_CONTRAST) {
    text = chooseReadableTextColor(background, primary, accent, colors);
  }

  if (contrastRatio(text, background) < MIN_TEXT_BG_CONTRAST) {
    const black = { r: 17, g: 24, b: 39 };
    const white = { r: 250, g: 250, b: 252 };
    text = contrastRatio(black, background) >= contrastRatio(white, background) ? black : white;
  }

  if (contrastRatio(text, primary) < MIN_TEXT_PRIMARY_CONTRAST) {
    primary = nudgeColorForContrast(primary, text, MIN_TEXT_PRIMARY_CONTRAST, stats.avgL >= 50 ? -1 : 1);
  }

  return { background, primary, accent, text };
}

function softenBackgroundColor(rgb, stats) {
  const hsl = rgbToHsl(rgb);
  const desiredLightness = stats.avgL < 30 ? 0.9 : 0.94;
  return hslToRgb({
    h: hsl.h,
    s: clamp(hsl.s, 0.04, 0.2),
    l: clamp((hsl.l + desiredLightness * 2) / 3, 0.88, 0.97),
  });
}

function tunePrimaryColor(rgb, background) {
  const hsl = rgbToHsl(rgb);
  let tuned = hslToRgb({
    h: hsl.h,
    s: clamp(Math.max(hsl.s, 0.45), 0.4, 0.82),
    l: clamp(hsl.l, 0.32, 0.62),
  });

  tuned = nudgeColorForContrast(tuned, background, 1.9, relativeLuminance(background) > 0.5 ? -1 : 1);
  return tuned;
}

function tuneAccentColor(rgb, primary, background) {
  let accent = { ...rgb };
  const accentHsl = rgbToHsl(accent);
  const primaryHsl = rgbToHsl(primary);
  const yellowPrimary = isWarmYellowHue(primaryHsl.h);

  let hue = accentHsl.h;
  if (hueDistance(hue, primaryHsl.h) < 28) {
    hue = deriveAccentHueFromPrimaryHue(primaryHsl.h);
  }

  accent = hslToRgb({
    h: hue,
    s: yellowPrimary
      ? clamp(Math.max(accentHsl.s * 0.9, primaryHsl.s * 0.6), 0.32, 0.68)
      : clamp(Math.max(accentHsl.s, primaryHsl.s + 0.08), 0.48, 0.9),
    l: yellowPrimary
      ? clamp(accentHsl.l - 0.1, 0.24, 0.46)
      : clamp(accentHsl.l, 0.36, 0.68),
  });

  if (labDistance(rgbToLab(accent), rgbToLab(primary)) < MIN_PRIMARY_ACCENT_DISTANCE) {
    accent = deriveAccentFromPrimary(primary);
  }

  return nudgeColorForContrast(accent, background, 1.8, relativeLuminance(background) > 0.5 ? -1 : 1);
}

function chooseReadableTextColor(background, primary, accent, colors) {
  const extractedCandidates = [...colors]
    .sort((left, right) => relativeLuminance(left.rgb) - relativeLuminance(right.rgb))
    .slice(0, 3)
    .map((color) => color.rgb);

  const builtInCandidates = [
    { r: 17, g: 24, b: 39 },
    { r: 31, g: 41, b: 55 },
    { r: 12, g: 18, b: 32 },
    { r: 248, g: 250, b: 252 },
    { r: 255, g: 255, b: 255 },
  ];

  const candidates = [...extractedCandidates, ...builtInCandidates];

  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const bgContrast = contrastRatio(candidate, background);
    const primaryContrast = contrastRatio(candidate, primary);
    const accentContrast = contrastRatio(candidate, accent);

    const bgPenalty = bgContrast < MIN_TEXT_BG_CONTRAST ? (MIN_TEXT_BG_CONTRAST - bgContrast) * 100 : 0;
    const primaryPenalty = primaryContrast < MIN_TEXT_PRIMARY_CONTRAST
      ? (MIN_TEXT_PRIMARY_CONTRAST - primaryContrast) * 18
      : 0;
    const score = bgContrast * 8 + primaryContrast * 2 + accentContrast - bgPenalty - primaryPenalty;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function deriveAccentFromPrimary(primary) {
  const primaryHsl = rgbToHsl(primary);
  return hslToRgb({
    h: deriveAccentHueFromPrimaryHue(primaryHsl.h),
    s: clamp(primaryHsl.s + 0.12, 0.55, 0.92),
    l: clamp(primaryHsl.l + 0.08, 0.42, 0.66),
  });
}

function deriveAccentHueFromPrimaryHue(primaryHue) {
  const hue = normalizeHue(primaryHue);
  // Yellow-heavy subjects often include olive outlines; bias accent toward earthy amber/brown.
  if (isWarmYellowHue(hue)) {
    return normalizeHue(hue - 24);
  }
  return (hue + 42) % 360;
}

function isWarmYellowHue(hue) {
  const normalizedHue = normalizeHue(hue);
  return normalizedHue >= 38 && normalizedHue <= 82;
}

function isGreenishHue(hue) {
  const normalizedHue = normalizeHue(hue);
  return normalizedHue >= 82 && normalizedHue <= 170;
}

function nudgeColorForContrast(baseColor, againstColor, minimumContrast, direction) {
  const hsl = rgbToHsl(baseColor);
  let lightness = hsl.l;
  let current = { ...baseColor };
  let steps = 0;

  while (steps < 24 && contrastRatio(current, againstColor) < minimumContrast) {
    lightness = clamp(lightness + direction * 0.025, 0.12, 0.9);
    current = hslToRgb({ h: hsl.h, s: hsl.s, l: lightness });
    steps += 1;
  }

  return current;
}

function pickBestColor(colors, scoreFn) {
  if (colors.length === 0) {
    return null;
  }

  let best = colors[0];
  let bestScore = scoreFn(best);

  for (const color of colors.slice(1)) {
    const score = scoreFn(color);
    if (score > bestScore) {
      best = color;
      bestScore = score;
      continue;
    }

    if (Math.abs(score - bestScore) < 0.01) {
      if (color.pop > best.pop || (color.pop === best.pop && color.hex.localeCompare(best.hex) < 0)) {
        best = color;
        bestScore = score;
      }
    }
  }

  return best;
}

function summarizeRgb(rgb) {
  const lab = rgbToLab(rgb);
  const hsl = rgbToHsl(rgb);
  return {
    rgb,
    lab,
    hsl,
    chroma: Math.sqrt(lab.a * lab.a + lab.b * lab.b),
  };
}

function getNearestLabIndex(lab, centroids) {
  let nearest = 0;
  let nearestDistance = labDistanceSquared(lab, centroids[0]);
  for (let index = 1; index < centroids.length; index += 1) {
    const distance = labDistanceSquared(lab, centroids[index]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  }
  return nearest;
}

function quantizationKey(rgb) {
  const r = Math.floor(rgb.r / 16);
  const g = Math.floor(rgb.g / 16);
  const b = Math.floor(rgb.b / 16);
  return `${r}-${g}-${b}`;
}

function labDistance(left, right) {
  return Math.sqrt(labDistanceSquared(left, right));
}

function labDistanceSquared(left, right) {
  const l = left.l - right.l;
  const a = left.a - right.a;
  const b = left.b - right.b;
  return l * l + a * a + b * b;
}

function hueDistance(left, right) {
  const diff = Math.abs(left - right) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function normalizeHue(hue) {
  if (!Number.isFinite(hue)) {
    return 0;
  }
  return ((hue % 360) + 360) % 360;
}

function contrastRatio(leftRgb, rightRgb) {
  const left = relativeLuminance(leftRgb);
  const right = relativeLuminance(rightRgb);
  const brightest = Math.max(left, right);
  const darkest = Math.min(left, right);
  return (brightest + 0.05) / (darkest + 0.05);
}

function relativeLuminance(rgb) {
  const toLinear = (channel) => {
    const value = channel / 255;
    if (value <= 0.04045) {
      return value / 12.92;
    }
    return ((value + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbToLab(rgb) {
  const xyz = rgbToXyz(rgb);
  return xyzToLab(xyz);
}

function rgbToXyz(rgb) {
  const toLinear = (channel) => {
    const value = channel / 255;
    if (value <= 0.04045) {
      return value / 12.92;
    }
    return ((value + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  return {
    x: (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100,
    y: (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100,
    z: (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100,
  };
}

function xyzToLab(xyz) {
  const x = xyz.x / 95.047;
  const y = xyz.y / 100;
  const z = xyz.z / 108.883;

  const transform = (value) => {
    if (value > 0.008856) {
      return value ** (1 / 3);
    }
    return (7.787 * value) + (16 / 116);
  };

  const fx = transform(x);
  const fy = transform(y);
  const fz = transform(z);

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return { h: hue, s: saturation, l: lightness };
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
    r: clampChannel(Math.round((r + m) * 255)),
    g: clampChannel(Math.round((g + m) * 255)),
    b: clampChannel(Math.round((b + m) * 255)),
  };
}

function rgbToHex(rgb) {
  const channelToHex = (channel) => clampChannel(channel).toString(16).padStart(2, "0");
  return `#${channelToHex(rgb.r)}${channelToHex(rgb.g)}${channelToHex(rgb.b)}`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampChannel(value) {
  return clamp(Math.round(value), 0, 255);
}
