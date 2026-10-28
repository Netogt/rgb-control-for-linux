# RGB Control

Interface desktop (Tauri 2 + React + TypeScript) para escolher cores e efeitos dos dispositivos RGB, usando o servidor SDK do OpenRGB compilado com o detector do **XPG Spectrix S20G** (ver `../controlar-rgb-xpg-s20g-linux.md`).

## Como funciona

```
React (webview) ──invoke──▶ Rust (Tauri) ──TCP 6742, protocolo SDK v4──▶ openrgb --server (root) ──NVMe/USB/SMBus──▶ dispositivos
```

- O **servidor OpenRGB** roda como root, porque o SSD é acessado pelo `/dev/nvme0`. O app roda como usuário comum e só conversa com ele pela rede local.
- O cliente do SDK foi escrito em Rust, em `src-tauri/src/openrgb.rs`. Ele negocia o protocolo 4, que o servidor atual (protocolo 6) continua aceitando.
- Ao aplicar uma cor num dispositivo que está num efeito sem cor (ex.: arco-íris), o app troca para o modo **Static**, ou **Direct** se não houver Static, e avisa.

## Requisitos

O [`instalar.sh`](../instalar.sh) da raiz instala as dependências, compila o OpenRGB modificado e instala o app. Para desenvolver, rode-o uma vez antes.

O app procura o OpenRGB em `/usr/local/bin/openrgb` e em `~/Projetos/rgb/OpenRGB/openrgb`; outro caminho pode ser definido em **Configurações**.

## Rodar em desenvolvimento

```bash
npm install
npm run tauri dev
```

## Gerar o executável

```bash
npm run tauri build -- --no-bundle        # binário em src-tauri/target/release/rgb-control
npm run tauri build -- --bundles deb      # ou rpm / appimage
```

## Uso

1. Na primeira vez, clique em **Iniciar servidor**: o polkit pede sua senha.
2. Para não precisar disso a cada boot, use **Configurações › Servidor OpenRGB › Instalar**. Isso copia o binário para `/usr/local/bin/openrgb` e cria o `openrgb-server.service`.
3. Escolha um dispositivo, uma cor e um efeito. Em **Área** dá para pintar uma zona ou LEDs específicos (Shift+clique seleciona um intervalo).
4. O SSD volta ao arco-íris quando o PC fica sem energia. Em **Configurações › Cena inicial**, clique em **Salvar estado atual** e ative **Reaplicar ao iniciar a sessão**. Isso cria `~/.config/autostart/rgb-control-apply.desktop`, que roda `rgb-control --apply-saved` sem abrir janela.

A configuração fica em `~/.config/dev.luizneto.rgbcontrol/config.json`.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `src-tauri/src/openrgb.rs` | Cliente do protocolo SDK (pacotes, parsing de dispositivos, modos e zonas) |
| `src-tauri/src/lib.rs` | Comandos Tauri e a lógica de "pintar" (escolha de modo, zona e LEDs) |
| `src-tauri/src/scene.rs` | Configuração persistente, cena inicial e o modo `--apply-saved` |
| `src-tauri/src/system.rs` | pkexec, serviço systemd e autostart |
| `src/App.tsx` | Estado da aplicação e fluxo de conexão |
| `src/components/` | Barra lateral, seletor de cor, efeitos, área, configurações |
