import { ColorMode, type Color, type Device } from "./api";

export function hexToColor(hex: string): Color | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function colorToHex(c: Color): string {
  return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function normalizeHex(hex: string): string {
  const c = hexToColor(hex);
  return c ? colorToHex(c) : hex;
}

/** Luminância relativa (WCAG), usada para escolher texto claro ou escuro. */
export function luminance({ r, g, b }: Color): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function readableOn(hex: string): string {
  const c = hexToColor(hex);
  return c && luminance(c) > 0.45 ? "#0d0f14" : "#ffffff";
}

/**
 * Cores que o dispositivo está mostrando de fato. Modos com cor própria
 * (ex.: "Estático" do teclado Pichau ou da placa ASUS) guardam a cor no
 * modo, não nos LEDs. `null` = efeito sem cor fixa (arco-íris, aleatório).
 */
export function visibleColors(device: Device): Color[] | null {
  const mode = device.modes[device.activeMode];
  if (!mode) return device.colors;
  if (mode.name.toLowerCase() === "off") return [];
  if (mode.colorMode === ColorMode.ModeSpecific && mode.colors.length > 0) return mode.colors;
  if (mode.colorMode === ColorMode.PerLed) return device.colors;
  return null;
}

/** Cor que representa o dispositivo; `null` = efeito multicolorido. */
export function deviceSwatch(device: Device): string | null {
  const colors = visibleColors(device);
  if (colors === null) return null;
  return dominantColor(colors) ?? "#000000";
}

/** Cor mais frequente da lista; representa o dispositivo na barra lateral. */
export function dominantColor(colors: Color[]): string | null {
  if (colors.length === 0) return null;
  const counts = new Map<string, number>();
  for (const c of colors) {
    const hex = colorToHex(c);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
