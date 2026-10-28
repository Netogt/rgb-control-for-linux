# Teclado Pichau Aurum

Driver do OpenRGB para o **Pichau Aurum V80** (USB `36ae:fe9c`, fabricante SDCINNOVATION), em `OpenRGB/Controllers/PichauAurumController/` depois do patch.

O protocolo foi documentado pelo projeto [OpenAurum](https://github.com/its-danilo/openaurum), que o capturou do software oficial do Windows. O OpenAurum foi feito para o Aurum V60, que usa o mesmo ID USB. Este driver foi testado no V80.

## O que funciona

- **Efeitos:** os 16 efeitos do teclado (Off e 1 a 15):

  | Nº | Efeito | Cor escolhível |
  |---|---|---|
  | 0 | Off (Desligado) | — |
  | 1 | Static (Estático) | sim |
  | 2 | Breathing (Respiração) | sim |
  | 3 | Spin (Giro) | não |
  | 4 | Color Cycle (Ciclo de cores) | não |
  | 5 | Stream (Fluxo) | sim |
  | 6 | Bloom (Florescer) | sim |
  | 7 | Up-Down Wave (Onda vertical) | sim |
  | 8 | Cross (Cruz) | sim |
  | 9 | Rain (Chuva) | sim |
  | 10 | Meteor (Meteoro) | sim |
  | 11 | Reactive Spread (Reativo em expansão) | sim |
  | 12 | Reactive Spread Reverse (Reativo em contração) | sim |
  | 13 | Reactive (Reativo) | sim |
  | 14 | Sudoku | sim |
  | 15 | Tide (Maré) | sim |

- **Ajustes:** velocidade (3 níveis) e brilho (0 a 10 no app).
- **Cor:** nos efeitos com cor escolhível, "Do efeito" (uma cor) ou "Aleatória" (o teclado varia as cores).
- **Estado salvo:** cada mudança fica gravada no teclado e continua lá depois de desligar o PC.

**Não suportado:** cores por tecla (efeito 16 do teclado). Precisaria do mapa de teclas do V80. No OpenRGB, o teclado aparece como um único LED.

## Protocolo

- **Interface:** USB HID 2, usage page `0xFF00`.
- **Relatórios:** 64 bytes, sem report ID. Na escrita, vai um byte `0x00` antes, mais os 64 bytes.
- **Respostas:** começam com `AA <comando>`.

| Comando | Bytes enviados | Resposta |
|---|---|---|
| Informações | `06 05` | contém o PID `9c fe` |
| Efeito atual | `06 0a` | efeito no byte 7 |
| Ler ajustes de um efeito | `06 16 00 00 00 01 00 MM` | os 9 bytes de ajustes a partir do byte 7 |
| Gravar ajustes | `06 0b 0b 00 00 01 00` + 9 bytes | repete os 9 bytes gravados |

Os 9 bytes de ajustes:

| Byte | Campo | Valores |
|---|---|---|
| 0 | Efeito (`MM`) | 0 a 15 |
| 1 | Brilho | 0 a 4 |
| 2 | Velocidade | 0 a 2 |
| 3 | Direção | o driver preserva o valor lido |
| 4 | Cor única | 1 = cor escolhida (HSV abaixo), 0 = aleatória |
| 5 | Reservado | o driver preserva o valor lido |
| 6 a 8 | Matiz, saturação, valor | cor em HSV, 0 a 255 cada |

O driver repete cada comando até 3 vezes e confere se a resposta é a esperada.

### Comandos que o driver nunca envia

- `06 0f ff`: **restaura o padrão de fábrica.**
- `55 ff …` e `5a a0`: **atualização de firmware.** Enviados por engano, podem inutilizar o teclado.

## Detalhes da implementação

### Gravações na memória flash

O teclado grava cada mudança na memória flash, que aguenta um número limitado de gravações. Arrastar o seletor de cor geraria centenas delas. Por isso o driver:
- espera **400 ms** sem mudanças antes de gravar, e só o último valor é gravado;
- não grava se o valor for igual ao último gravado;
- grava o que estiver pendente ao fechar.

As gravações rodam numa thread separada, então o app não trava esperando o teclado.

### Brilho

Com uma cor escolhida, o teclado ignora o byte de brilho e usa o "valor" (V) da cor HSV como brilho. Por isso, nesses casos, o driver aplica o brilho do app no V:
- **Escala:** o nível 1 a 10 vira um valor entre um mínimo visível e 255, numa curva exponencial.
- **Mínimo visível:** varia de 12 a 35, dependendo do efeito, porque abaixo disso o LED apaga.

Os níveis ficam com saltos de brilho parecidos aos olhos. Ao iniciar, o driver lê o V gravado e mostra no app o nível mais próximo.

Nos efeitos sem cor escolhida, o brilho do app (0 a 10) é convertido para o byte de brilho do teclado (0 a 4).

## Problemas conhecidos

- **Teclado para de responder depois de trocar de efeito:** o OpenAurum relata isso em alguns sistemas. A correção é o parâmetro de kernel `usbhid.quirks=0x36ae:0xfe9c:0x400`. Veja [Instalação](instalacao.md#teclado-pichau-aurum).
- **Outros modelos Pichau com aparência parecida** podem usar outro protocolo. O driver só é carregado para o ID `36ae:fe9c`.
