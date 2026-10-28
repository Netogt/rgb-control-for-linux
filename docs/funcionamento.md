# Como funciona

Visão técnica do projeto: as partes, como conversam e como o app roda e inicia com o sistema.

## Arquitetura

```
 Interface (React + TypeScript)     ← o que você vê e clica
          │  invoke() do Tauri
 Núcleo nativo (Rust + Tauri 2)     ← fala com o sistema e com o OpenRGB
          │  TCP 127.0.0.1:6742, protocolo SDK do OpenRGB
 Servidor OpenRGB (C++, como root)  ← fala com o hardware
          │  USB HID / SMBus / NVMe
 Placa-mãe, fitas ARGB, teclado, mouse, SSD
```

- O **servidor** roda como root porque acessa o SMBus da placa e o SSD por `/dev/nvme*`.
- O **app** roda como usuário comum e só conversa com o servidor pela rede local.

## Interface (`rgb-control/src/`)

É uma página React exibida numa janela do Tauri. No Linux, o Tauri usa o WebKitGTK, o motor web do sistema, sem navegador separado.

| Arquivo | Função |
|---|---|
| `App.tsx` | Estado do app (dispositivos, seleção, conexão) e fluxo de conexão e início do servidor |
| `components/Sidebar.tsx` | Lista de dispositivos |
| `components/ColorPanel.tsx` | Seletor de cor, favoritas e recentes |
| `components/EffectPanel.tsx` | Efeitos, velocidade, brilho, direção e cores do efeito |
| `components/TargetPanel.tsx` | Dispositivo inteiro, zona ou LEDs, e o tamanho das zonas |
| `components/SettingsDrawer.tsx` | Configurações |
| `components/ConnectScreen.tsx` | Tela exibida sem conexão |
| `components/deviceMeta.tsx` | Ícones, tipos e nomes dos efeitos em português |
| `api.ts` | Todas as chamadas ao Rust e os tipos de dados |
| `color.ts` | Conversões de cor e a cor que cada dispositivo está mostrando |
| `hooks.ts` | Envio "só a última cor" ao arrastar o seletor, avisos e temporizadores |

### Tema

- Todas as cores ficam em variáveis CSS no topo de `styles.css`, como `--bg`, `--text` e `--accent`. Os componentes usam só essas variáveis.
- Um bloco `@media (prefers-color-scheme: light)` redefine as variáveis com tons claros. Assim o app segue o tema claro ou escuro do sistema sozinho.
- A variável `--current` recebe a cor escolhida e dá o brilho em volta da amostra de cor do painel Cor.

### Envio de cores ao arrastar

Com a prévia ao vivo ligada, o seletor gera dezenas de cores por segundo. O `useLatestSender` (`hooks.ts`) envia uma por vez e, enquanto uma está a caminho, guarda só a mais recente. Isso evita uma fila de comandos atrasados no hardware.

## Núcleo em Rust (`rgb-control/src-tauri/src/`)

| Arquivo | Função |
|---|---|
| `openrgb.rs` | Cliente do protocolo do OpenRGB |
| `lib.rs` | Comandos chamados pela interface, a lógica de pintar e o monitor da conexão |
| `scene.rs` | Configuração salva, cena inicial e o modo sem janela |
| `system.rs` | pkexec, serviço systemd, regra do polkit e autostart |
| `main.rs` | Ponto de entrada: com `--apply-saved` roda sem janela; sem ele, abre o app |

### Protocolo do OpenRGB

Cada pacote tem um cabeçalho de 16 bytes, seguido dos dados:
- os 4 bytes `ORGB`;
- o índice do dispositivo;
- o id do comando;
- o tamanho dos dados.

Os números são little-endian e cada cor é um `u32` no formato `0x00BBGGRR`. O app negocia a versão 4 do protocolo, que o servidor atual (versão 6) continua aceitando.

Comandos usados:

| Id | Comando |
|---|---|
| 0 | Número de dispositivos |
| 1 | Dados do dispositivo: modos, zonas, LEDs e cores |
| 40 | Versão do protocolo |
| 50 | Nome do cliente |
| 100 | Aviso do servidor: a lista de dispositivos mudou |
| 140 | Detectar dispositivos de novo |
| 1000 | Mudar o tamanho de uma zona (fitas ARGB); o servidor salva o tamanho |
| 1050 | Atualizar as cores dos LEDs |
| 1100 | Modo personalizado |
| 1101 / 1102 | Atualizar / gravar o modo |

### Como uma cor chega ao dispositivo

Cada dispositivo aceita cor de um jeito. O `paint()` em `lib.rs` decide pelo que o modo ativo anuncia:

- **Modo com cor própria, aplicada no dispositivo inteiro:** é o caso do teclado e do "Estático" da placa ASUS.
  - O app usa o modo atual, se ele tiver cor do efeito, ou troca para "Estático".
  - Grava a cor no modo com o comando 1101.
- **Cor por LED, ou só numa zona ou em alguns LEDs:** é o caso do SSD, das fitas e do mouse.
  - O app escolhe um modo com cor por LED, nesta ordem: Estático, Direto ou o primeiro disponível.
  - Envia as cores com o comando 1050.

### Monitor da conexão

Uma thread verifica o servidor a cada 1,5 s e avisa a interface por eventos:
- `rgb://connection`: conectou ou caiu;
- `rgb://devices-changed`: a lista de dispositivos mudou.

Se a conexão cair, a interface tenta reconectar a cada 4 s.

## Servidor OpenRGB modificado

O código é do [OpenRGB](https://gitlab.com/CalcProgrammer1/OpenRGB) no commit `bbc7747`, mais o patch [`openrgb-patch/xpg-s20g-pichau-aurum.patch`](../openrgb-patch/xpg-s20g-pichau-aurum.patch). O patch mexe em:

- **`Controllers/ENESMBusController/XPGSpectrixS40GDetect_Linux.cpp`:** passa a detectar também o XPG Spectrix S20G. Veja [SSD XPG S20G](ssd-xpg-s20g.md).
- **`Controllers/PichauAurumController/`:** driver novo do teclado. Veja [Teclado Pichau Aurum](teclado-pichau-aurum.md).

## Como o servidor roda sem abrir o app

O app instala o serviço do systemd `/etc/systemd/system/openrgb-server.service`:

```ini
[Service]
Type=simple
Environment=QT_QPA_PLATFORM=offscreen
Environment=HOME=/root
ExecStart=/usr/local/bin/openrgb --server --server-host 127.0.0.1 --server-port 6742
Restart=on-failure
```

As duas variáveis de ambiente:
- `QT_QPA_PLATFORM=offscreen` deixa o OpenRGB rodar sem tela;
- `HOME=/root` faz o OpenRGB salvar a configuração, incluindo o tamanho das fitas, em `/root/.config/OpenRGB`. Sem ela, o serviço gravaria em `/`.

Como os modos usam esse serviço:

| Modo | Serviço | Quem liga e desliga |
|---|---|---|
| Junto com o app | instalado, desativado no boot | o app, ao abrir e ao fechar |
| Sempre ligado | ativado no boot (`systemctl enable`) | o systemd |
| Manual | não instalado | você |

No modo **Junto com o app**, a regra `/etc/polkit-1/rules.d/50-rgb-control.rules` deixa o seu usuário rodar `start`, `stop` e `restart` só no `openrgb-server.service`, sem senha. Qualquer outra ação continua pedindo senha, inclusive `enable`, outros serviços ou outros usuários.

## Como as cores voltam no login

Ao ativar **Reaplicar ao iniciar a sessão**, o app cria `~/.config/autostart/rgb-control-apply.desktop`. O ambiente gráfico (KDE, GNOME etc.) executa essa entrada no login. Ela roda o próprio app como `rgb-control --apply-saved`, sem janela, que faz em ordem:

1. Lê a cena em `~/.config/dev.luizneto.rgbcontrol/config.json`.
2. Liga o serviço, se estiver parado.
3. Espera o servidor responder, por até 90 s, e a detecção de dispositivos estabilizar.
4. Para cada dispositivo da cena:
   - encontra o dispositivo pelo nome e pela posição no sistema, ou só pelo nome;
   - aplica o modo e as cores.
5. Desliga o serviço, se foi ele que ligou.

Depois disso as cores ficam nos próprios dispositivos, sem nada rodando.

## Configuração do app

`~/.config/dev.luizneto.rgbcontrol/config.json` guarda:
- endereço e porta do servidor;
- caminho do OpenRGB;
- "Conectar ao abrir" e "Prévia ao vivo";
- favoritas e recentes;
- a cena inicial.

O arquivo é gravado num temporário e depois renomeado, para não corromper se o PC desligar no meio.
