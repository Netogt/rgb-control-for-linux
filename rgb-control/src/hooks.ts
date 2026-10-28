import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Envia no máximo uma requisição por vez e sempre a mais recente: enquanto
 * uma está em andamento, os pedidos intermediários são descartados. Mantém
 * o arrastar do seletor de cor fluido sem enfileirar comandos no servidor.
 */
export function useLatestSender<T>(send: (value: T) => Promise<unknown>) {
  const inFlight = useRef(false);
  const pending = useRef<{ value: T } | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  const pump = useCallback(async (value: T) => {
    inFlight.current = true;
    try {
      await sendRef.current(value);
    } finally {
      inFlight.current = false;
      const next = pending.current;
      pending.current = null;
      if (next) void pump(next.value);
    }
  }, []);

  return useCallback(
    (value: T) => {
      if (inFlight.current) pending.current = { value };
      else void pump(value);
    },
    [pump],
  );
}

export type Toast = { id: number; kind: "success" | "error" | "info"; text: string };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 3500);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

export function useInterval(cb: () => void, ms: number | null) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}
