# Cimática

Toque uma nota no violão ou no violino: o app identifica a nota pela frequência e mostra a vibração como um padrão de cimática. A "areia" se acumula nas linhas nodais de uma placa vibrando, como numa placa de Chladni.

Tudo roda no navegador, sem instalar nada e sem enviar áudio para nenhum servidor.

## Funcionalidades

- **Detecção de nota** pelo algoritmo YIN, com afinador em cents.
- **Instrumento**: automático, violão ou violino. A faixa de frequência de cada um reduz erros de oitava.
- **Cordas soltas**: mostra a corda mais próxima e se é preciso apertar ou afrouxar.
- **Lá de referência** ajustável (432, 440, 442 Hz…).
- **Acordes**: detecta várias notas ao mesmo tempo e dá o nome do acorde em cifra e em português (C, Am, D7, G/B…). Os padrões das notas são sobrepostos na placa.
- **Placas**: quadrada (Chladni), circular, hexagonal, tampo de violão e água.
- **Volume e vibrato**: notas fortes agitam mais a areia, e o vibrato faz o padrão "respirar".
- **Histórico em partitura** (clave de sol; no violão a escrita é uma oitava acima, como de costume).
- **Treino**: o app pede uma nota e você ganha ponto se tocar a nota certa e afinada.
- **Gravação de vídeo** da placa com o áudio (arquivo .webm).
- **Modo apresentação** e tela cheia.
- **Demonstração** e **arquivo de áudio** para testar sem instrumento.
- Funciona como **app instalável** (PWA) e offline.

## Como usar

Abra a versão online pelo GitHub Pages (link na descrição do repositório) ou rode localmente:

```bash
python3 -m http.server 8000
```

Depois acesse http://localhost:8000. O navegador só libera o microfone em `https://` ou `localhost`.

No celular, abra o link do GitHub Pages e use "Adicionar à tela inicial" para instalar como app.

**Atalhos:** `P` apresentação · `F` tela cheia · `R` espalhar a areia.

## Como funciona

- **Nota**: o YIN mede o período da onda no sinal do microfone (diferença média normalizada cumulativa + interpolação parabólica).
- **Acordes**: picos de um espectro FFT de 16384 pontos; para cada nota candidata soma-se a energia dos seus harmônicos, escolhe-se a mais forte, removem-se seus harmônicos e repete-se.
- **Placas**: os padrões vêm das fórmulas de vibração de placas — `cos(nπx)cos(mπy) ± cos(mπx)cos(nπy)` na quadrada e funções de Bessel `Jₙ(kr)·cos(nθ)` na circular. Cada nota (MIDI) escolhe um modo; notas mais agudas dão padrões mais complexos. As partículas são agitadas proporcionalmente à amplitude local e se acumulam onde a placa fica parada.

A associação entre cada nota e um padrão é uma escolha do app: uma placa física real só forma padrões em certas frequências de ressonância.
