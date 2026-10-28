# RGB Control

App desktop para Linux que controla as cores dos dispositivos RGB do PC, usando o [OpenRGB](https://gitlab.com/CalcProgrammer1/OpenRGB) com duas adições:

- **SSD XPG Spectrix S20G:** detector para o SSD, que usa o mesmo protocolo do S40G (controlador ENE acessado por comandos NVMe).
- **Teclado Pichau Aurum V80** (USB `36ae:fe9c`): driver novo, feito a partir do protocolo documentado pelo [OpenAurum](https://github.com/its-danilo/openaurum).

> Projeto pessoal, testado só no hardware abaixo e sem suporte. O detector do SSD envia comandos NVMe e o driver do teclado grava na memória dele. Use por sua conta e risco.

## Funcionalidades

- **Cor:** seletor com HEX e RGB, favoritas, cores recentes e prévia ao vivo enquanto você arrasta.
- **Onde aplicar:** em todos os dispositivos de uma vez, num dispositivo, numa zona ou em LEDs específicos.
- **Efeitos:** os de cada dispositivo (estático, respiração, arco-íris etc.), com velocidade, brilho, direção e cores do efeito.
- **Fitas ARGB:** ajuste do número de LEDs das fitas nos pinos da placa-mãe.
- **Servidor automático:** o servidor OpenRGB abre e fecha junto com o app, sem pedir senha, ou fica sempre ligado.
- **Cores no boot:** reaplica as cores salvas a cada login, sem abrir a janela.
- **Tema:** segue o tema claro ou escuro do sistema.

## Hardware testado

| Dispositivo | Modelo |
|---|---|
| Placa-mãe | ASUS TUF Gaming A520M-Plus WiFi (LEDs da placa e pinos ARGB) |
| SSD | XPG Spectrix S20G 500 GB (`ASPECTRIXS20G-500G-C`, firmware `VC3S500S`) |
| Teclado | Pichau Aurum V80 |
| Mouse | Redragon M711 Cobra |
| Sistema | CachyOS |

Outros dispositivos suportados pelo OpenRGB também devem funcionar.

## Instalação rápida (CachyOS/Arch)

```sh
git clone https://github.com/Netogt/NOME_DO_REPOSITORIO.git ~/Projetos/rgb
cd ~/Projetos/rgb
./instalar.sh
```

Depois, abra o **RGB Control** pelo menu e faça a [primeira configuração](docs/instalacao.md#primeira-configuração):
1. servidor "Junto com o app";
2. tamanho das fitas ARGB;
3. cena inicial.

## Documentação

| Documento | Conteúdo |
|---|---|
| [Instalação](docs/instalacao.md) | O que o script faz, primeira configuração, atualização, desinstalação e instalação manual |
| [Uso](docs/uso.md) | Todas as telas e funções do app |
| [Como funciona](docs/funcionamento.md) | Arquitetura, protocolo, serviço, autostart e configuração |
| [Teclado Pichau Aurum](docs/teclado-pichau-aurum.md) | Efeitos, protocolo USB e detalhes do driver |
| [SSD XPG Spectrix S20G](docs/ssd-xpg-s20g.md) | Como o SSD foi feito funcionar no OpenRGB |
| [Solução de problemas](docs/problemas.md) | Conexão, dispositivos, fitas ARGB, autostart e compilação |
| [Desenvolvimento](docs/desenvolvimento.md) | Modo de desenvolvimento, testes, patch e atualização do OpenRGB |

## Estrutura

| Caminho | Conteúdo |
|---|---|
| [`rgb-control/`](rgb-control/) | O app: interface em `src/`, núcleo em Rust em `src-tauri/` |
| [`openrgb-patch/`](openrgb-patch/) | As modificações no OpenRGB, em formato de patch |
| [`instalar.sh`](instalar.sh) | Instalação e atualização |
| [`docs/`](docs/) | Documentação |

## Licença

- **App (`rgb-control/`), scripts e documentação:** GPL-3.0-or-later. Veja [LICENSE](LICENSE).
- **Patch do OpenRGB:** o OpenRGB é GPL-2.0-or-later, e o detector do SSD mantém essa licença. O driver do teclado é GPL-3.0, por seguir o protocolo do OpenAurum, que é GPL-3.0. Por isso, o OpenRGB compilado com o patch é distribuído sob a GPL-3.0.

## Créditos

- [OpenRGB](https://gitlab.com/CalcProgrammer1/OpenRGB): servidor e drivers dos dispositivos, incluindo o protocolo do XPG Spectrix S40G.
- [OpenAurum](https://github.com/its-danilo/openaurum), de its-danilo: documentação do protocolo USB dos teclados Pichau Aurum.
