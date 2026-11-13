/** Pick the higher-contrast ink for an opaque #RRGGBB project color. */
export function readableInk(hex: string) {
  const rgb = Number.parseInt(hex.slice(1), 16);
  function linear(channel: number) {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }
  const luminance =
    0.2126 * linear((rgb >> 16) & 255) +
    0.7152 * linear((rgb >> 8) & 255) +
    0.0722 * linear(rgb & 255);
  return luminance >= Math.sqrt(0.05 * 1.05) - 0.05 ? '#000000' : '#ffffff';
}
