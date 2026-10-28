import {
  Box,
  CircuitBoard,
  Cpu,
  Fan,
  Gamepad2,
  HardDrive,
  Headphones,
  Keyboard,
  Laptop,
  Lightbulb,
  MemoryStick,
  Mic,
  Monitor,
  Mouse,
  Speaker,
  type LucideIcon,
} from "lucide-react";

/** Ordem igual ao enum device_type do OpenRGB. */
const TYPES: [string, LucideIcon][] = [
  ["Placa-mãe", CircuitBoard],
  ["Memória", MemoryStick],
  ["Placa de vídeo", Cpu],
  ["Cooler", Fan],
  ["Fita de LED", Lightbulb],
  ["Teclado", Keyboard],
  ["Mouse", Mouse],
  ["Mousepad", Box],
  ["Headset", Headphones],
  ["Suporte de headset", Headphones],
  ["Controle", Gamepad2],
  ["Luminária", Lightbulb],
  ["Caixa de som", Speaker],
  ["Virtual", Box],
  ["Armazenamento", HardDrive],
  ["Gabinete", Box],
  ["Microfone", Mic],
  ["Acessório", Box],
  ["Teclado numérico", Keyboard],
  ["Notebook", Laptop],
  ["Monitor", Monitor],
];

export function deviceTypeLabel(type: number): string {
  return TYPES[type]?.[0] ?? "Dispositivo";
}

export function DeviceIcon({ type, size = 18 }: { type: number; size?: number }) {
  const Icon = TYPES[type]?.[1] ?? Box;
  return <Icon size={size} aria-hidden />;
}

/** Nomes de modos mais comuns traduzidos; os demais aparecem como vêm. */
const MODE_LABELS: Record<string, string> = {
  direct: "Direto",
  static: "Estático",
  off: "Desligado",
  breathing: "Respiração",
  flashing: "Piscar",
  "spectrum cycle": "Ciclo de espectro",
  rainbow: "Arco-íris",
  "rainbow wave": "Onda arco-íris",
  "chase fade": "Perseguição suave",
  chase: "Perseguição",
  "random flicker": "Cintilar aleatório",
  wave: "Onda",
  custom: "Personalizado",
  "color cycle": "Ciclo de cores",
  reactive: "Reativo",
  ripple: "Ondulação",
  starry: "Estrelado",
  "starry night": "Noite estrelada",
  strobe: "Estroboscópio",
  marquee: "Letreiro",
  spin: "Giro",
  stream: "Fluxo",
  bloom: "Florescer",
  "up-down wave": "Onda vertical",
  cross: "Cruz",
  rain: "Chuva",
  meteor: "Meteoro",
  "reactive spread": "Reativo em expansão",
  "reactive spread reverse": "Reativo em contração",
  sudoku: "Sudoku",
  tide: "Maré",
};

export function modeLabel(name: string): string {
  return MODE_LABELS[name.toLowerCase()] ?? name;
}
