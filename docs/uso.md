# Uso

Guia das telas e funções do RGB Control.

## Tela inicial e conexão

O app só funciona com o servidor do OpenRGB rodando. Com **"Junto com o app"** configurado (veja [Instalação](instalacao.md#primeira-configuração)), isso é automático: o app sobe o servidor ao abrir, conecta e o desliga ao fechar.

Se o servidor não estiver rodando, aparece a tela **"Conecte ao servidor OpenRGB"**, com:
- **Iniciar servidor:** sobe o serviço. Se o serviço não estiver instalado, pede a senha e roda o OpenRGB como root até desligar o PC.
- **Tentar novamente:** tenta conectar de novo. A tela também tenta sozinha a cada 4 segundos.
- **Prefiro iniciar pelo terminal:** mostra o comando `sudo openrgb --server …`.

## Barra lateral

- **Todos os dispositivos:** a mesma cor em tudo de uma vez. Só aparece com mais de um dispositivo.
- **Lista de dispositivos:** nome, tipo, efeito atual e uma bolinha com a cor que o dispositivo está mostrando:

  | Bolinha | Significado |
  |---|---|
  | Cor sólida | A cor do dispositivo (ou a mais frequente, quando os LEDs têm cores diferentes) |
  | Gradiente colorido | Efeito sem cor fixa, como arco-íris ou cor aleatória |
  | Círculo vazio | Desligado |

- **Procurar dispositivos novamente** (ícone ↻): faz o OpenRGB detectar os dispositivos de novo. Use depois de conectar um dispositivo USB.
- **Configurações:** no rodapé.

## Painel Cor

- **Seletor:** arraste para escolher a cor.
- **HEX e R/G/B:** digite o valor exato. O HEX é aplicado ao sair do campo ou apertar Enter.
- **Favoritas:**
  - **Salvar atual** guarda a cor do seletor;
  - clicar numa favorita a seleciona;
  - com uma favorita selecionada, **Remover atual** a apaga.
- **Recentes:** as últimas 10 cores aplicadas.
- **Aplicar:** envia a cor. O texto do botão diz onde ela será aplicada, por exemplo "Aplicar no dispositivo inteiro" ou "Aplicar em todos os dispositivos".
- **Prévia ao vivo** (canto superior direito ou Configurações): com ela ligada, a cor é enviada enquanto você arrasta, sem precisar clicar em Aplicar.

Se o dispositivo estiver num efeito sem cor própria (como arco-íris), aplicar uma cor o troca para **Estático** e o app avisa.

## Painel Efeito

Aparece ao selecionar um dispositivo. Os efeitos e ajustes dependem do que cada dispositivo suporta.

- **Lista de efeitos:** Estático, Respiração, Arco-íris etc. Clique para trocar.
- **Velocidade e Brilho:** controles deslizantes, quando o efeito permite.
- **Direção:** esquerda/direita, cima/baixo ou horizontal/vertical, quando o efeito permite.
- **Origem da cor:** de onde vem a cor do efeito:
  - **Por LED:** cada LED tem a sua cor, definida pelo painel Cor;
  - **Do efeito:** o efeito tem uma ou mais cores próprias;
  - **Aleatória:** o dispositivo escolhe a cor.
- **Cores do efeito** (com "Do efeito"): clique numa amostra para trocá-la pela cor do seletor. Use **+** e **−** para mudar quantas cores o efeito usa.
- **Salvar no dispositivo:** grava o efeito na memória do dispositivo, para ele voltar assim mesmo sem o app. Só aparece em dispositivos que precisam de gravação manual. Os outros gravam sozinhos, como o teclado Pichau, ou não guardam nada.

## Painel Área

Aparece em dispositivos com mais de um LED ou com zonas de tamanho ajustável. Define onde a cor do painel Cor é aplicada:

- **Dispositivo inteiro.**
- **Uma zona:** por exemplo, os LEDs da placa ou um pino ARGB.
- **LEDs:** clique nos LEDs para selecionar. **Shift + clique** seleciona um intervalo.

### Fitas ARGB endereçáveis

O OpenRGB não tem como saber quantos LEDs há em cada fita ligada nos pinos ARGB da placa-mãe, então elas começam com **0 LEDs** e não acendem.

1. Selecione a placa-mãe.
2. No painel **Área**, escolha a zona do pino ARGB.
3. Em **Tamanho**, informe o número de LEDs da fita, que costuma estar na caixa ou na especificação. Se não souber, aumente aos poucos até a fita acender inteira.
4. Aplique uma cor.

O tamanho fica salvo no servidor (em `/root/.config/OpenRGB`) e vale para as próximas vezes.

## Configurações

### Conexão
- **Endereço e Porta:** onde está o servidor. O padrão é `127.0.0.1:6742`.
- **Conectar ao abrir:** conecta sozinho quando o app abre.
- **Conectar / Desconectar.**

### Servidor OpenRGB
- **Executável:** o caminho do OpenRGB modificado. O app sugere os que encontrar, como `/usr/local/bin/openrgb`.
- **Como o servidor roda:**

  | Opção | O que faz |
  |---|---|
  | **Junto com o app** (recomendado) | O servidor abre quando você abre o app e fecha quando você fecha. Não pede senha depois de configurado. |
  | **Sempre ligado** | O servidor inicia no boot e fica rodando em segundo plano. O app conecta na hora. |
  | **Manual** | Remove o serviço. Você inicia o servidor pelo terminal ou pelo botão "Iniciar servidor", com senha. |

  Escolher "Junto com o app" ou "Sempre ligado" pede a senha uma vez. Isso copia o executável para `/usr/local/bin/openrgb` e fecha qualquer OpenRGB aberto.
- **Iniciar agora:** sobe o servidor, quando ele está parado.

### Cena inicial
A "cena" é uma foto do estado atual: o efeito, os ajustes e as cores de cada dispositivo.
- **Salvar estado atual:** guarda a cena.
- **Aplicar agora:** reaplica a cena salva.
- **Reaplicar ao iniciar a sessão:** reaplica a cena a cada login, sem abrir a janela. Precisa de uma cena salva.

A cena é reaplicada como foi salva da última vez. Se você mudar as cores, clique em **Salvar estado atual** de novo.

### Comportamento
- **Prévia ao vivo:** a mesma opção do canto superior da tela.

## O que fica salvo em cada dispositivo

O servidor só é necessário para **mudar** as cores. Depois de aplicadas, cada dispositivo continua mostrando a cor sozinho:

| Dispositivo | Quanto tempo mantém a cor |
|---|---|
| Teclado Pichau Aurum | Grava na memória interna; mantém até desligado da tomada |
| Placa-mãe, fitas ARGB, mouse | Enquanto o PC estiver ligado; a placa pode manter após reiniciar |
| SSD XPG S20G | Enquanto tiver energia; volta ao arco-íris ao tirar o PC da tomada |

Por isso a opção **Reaplicar ao iniciar a sessão** existe: ela garante as cores a cada login.
