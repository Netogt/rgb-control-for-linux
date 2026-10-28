# RGB Control

App desktop para Linux que controla as cores dos dispositivos RGB do PC, usando o [OpenRGB](https://gitlab.com/CalcProgrammer1/OpenRGB) com duas adições:

- **SSD XPG Spectrix S20G:** detector para o SSD, que usa o mesmo protocolo do S40G (controlador ENE acessado por comandos NVMe).
- **Teclado Pichau Aurum V80** (USB `36ae:fe9c`): driver novo, feito a partir do protocolo documentado pelo [OpenAurum](https://github.com/its-danilo/openaurum).

O app em si (Tauri 2 + React + Rust) conversa com o servidor do OpenRGB e cuida de:
- escolher cor e efeito, para o PC todo ou para um dispositivo, zona ou LED;
- ligar o servidor junto com o app e desligá-lo ao fechar;
- reaplicar as cores ao iniciar a sessão.

> Projeto pessoal, testado só no hardware abaixo e sem suporte. O detector do SSD envia comandos NVMe e o driver do teclado grava na memória dele. Use por sua conta e risco.

## Hardware testado

| Dispositivo | Modelo |
|---|---|
| Placa-mãe | ASUS TUF Gaming A520M-Plus WiFi (LEDs da placa e pinos ARGB) |
| SSD | XPG Spectrix S20G 500 GB (`ASPECTRIXS20G-500G-C`, firmware `VC3S500S`) |
| Teclado | Pichau Aurum V80 |
| Mouse | Redragon M711 Cobra |
| Sistema | CachyOS |

## Instalação (CachyOS/Arch)

```sh
git clone https://github.com/Netogt/NOME_DO_REPOSITORIO.git ~/Projetos/rgb
cd ~/Projetos/rgb
./instalar.sh
```

O script:
1. instala as dependências com `pacman`;
2. baixa o OpenRGB na versão usada (commit `bbc7747`) e aplica `openrgb-patch/xpg-s20g-pichau-aurum.patch`;
3. compila o OpenRGB e o instala em `/usr/local/bin/openrgb`;
4. compila o app e o instala em `~/.local/bin/rgb-control`, com atalho no menu.

Depois, no app:
1. **Configurações → Como o servidor roda → "Junto com o app"**. Isso instala o serviço `openrgb-server` e uma regra do polkit que deixa o seu usuário ligá-lo e desligá-lo sem senha.
2. Fitas ARGB da placa-mãe: ajuste o número de LEDs no painel **Área**.
3. Em **Cena inicial**, clique em **Salvar estado atual** e ative **Reaplicar ao iniciar a sessão**. O SSD volta ao arco-íris quando o PC fica sem energia, e assim as cores voltam sozinhas a cada login.

Se o teclado parar de responder depois de trocar de efeito, adicione `usbhid.quirks=0x36ae:0xfe9c:0x400` aos parâmetros do kernel.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| [`rgb-control/`](rgb-control/) | O app (detalhes no [README dele](rgb-control/README.md)) |
| [`openrgb-patch/`](openrgb-patch/) | As modificações no OpenRGB, em formato de patch |
| [`instalar.sh`](instalar.sh) | Instalação e atualização |
| [`controlar-rgb-xpg-s20g-linux.md`](controlar-rgb-xpg-s20g-linux.md) | Como o SSD foi feito funcionar no OpenRGB |

## Licença

- **App (`rgb-control/`) e scripts:** GPL-3.0-or-later. Veja [LICENSE](LICENSE).
- **Patch do OpenRGB:** o OpenRGB é GPL-2.0-or-later. O detector do SSD mantém essa licença. O driver do teclado é GPL-3.0, por seguir o protocolo do OpenAurum, que é GPL-3.0. Por isso, o OpenRGB compilado com o patch é distribuído sob a GPL-3.0.

## Créditos

- [OpenRGB](https://gitlab.com/CalcProgrammer1/OpenRGB): servidor e drivers dos dispositivos, incluindo o protocolo do XPG Spectrix S40G.
- [OpenAurum](https://github.com/its-danilo/openaurum), de its-danilo: documentação do protocolo USB dos teclados Pichau Aurum.
