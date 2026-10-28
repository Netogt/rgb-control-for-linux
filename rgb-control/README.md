# RGB Control (app)

Interface desktop (Tauri 2 + React + TypeScript + Rust) para escolher cores e efeitos dos dispositivos RGB, usando o servidor SDK do OpenRGB modificado deste repositório.

```
React (webview) ──invoke──▶ Rust (Tauri) ──TCP 6742, protocolo SDK v4──▶ openrgb --server (root) ──NVMe/USB/SMBus──▶ dispositivos
```

- **Instalação e uso:** [Instalação](../docs/instalacao.md) e [Uso](../docs/uso.md).
- **Como funciona por dentro:** [Como funciona](../docs/funcionamento.md).

## Desenvolvimento

Rode o [`instalar.sh`](../instalar.sh) da raiz uma vez antes. Ele instala as dependências e compila o OpenRGB modificado.

```bash
npm install
npm run tauri dev                        # interface com recarga instantânea
npx tsc -b                               # verifica os tipos
(cd src-tauri && cargo test)             # testes do Rust
npm run tauri build -- --no-bundle       # versão final em src-tauri/target/release/rgb-control
```

O app procura o OpenRGB em `/usr/local/bin/openrgb` e em `~/Projetos/rgb/OpenRGB/openrgb`. Outro caminho pode ser definido em **Configurações**.

Mais detalhes em [Desenvolvimento](../docs/desenvolvimento.md).

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `src/App.tsx` | Estado da aplicação e fluxo de conexão e início do servidor |
| `src/components/` | Barra lateral, seletor de cor, efeitos, área, configurações e tela de conexão |
| `src/api.ts` | Chamadas ao Rust e tipos de dados |
| `src/color.ts` | Conversões de cor e a cor que cada dispositivo está mostrando |
| `src/styles.css` | Estilos e tema claro/escuro |
| `src-tauri/src/openrgb.rs` | Cliente do protocolo SDK: pacotes e parsing de dispositivos, modos e zonas |
| `src-tauri/src/lib.rs` | Comandos Tauri, a lógica de "pintar" e o monitor da conexão |
| `src-tauri/src/scene.rs` | Configuração salva, cena inicial e o modo `--apply-saved` |
| `src-tauri/src/system.rs` | pkexec, serviço systemd, regra do polkit e autostart |

A configuração fica em `~/.config/dev.luizneto.rgbcontrol/config.json`.
