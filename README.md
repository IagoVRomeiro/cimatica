# Cimática: violão/violino → nota na tela → desenho no sal

Você toca uma nota. O programa (`index.html`) mostra qual é a nota e manda um **tom puro** daquela frequência para um exciter colado embaixo de uma placa de metal. O sal se junta nas linhas da placa que não vibram e forma o desenho (figuras de Chladni).

```
instrumento → captador piezo → PC (index.html: detecta a nota)
                                 ↓ tom puro na frequência da nota
                              amplificador → exciter → placa com sal
```

Tocar o instrumento perto da placa não basta: o som pelo ar é fraco e tem harmônicos demais. É o tom puro, direto na placa, que forma o desenho.

## 1. Peças (~R$ 140–250)

| Peça | O que pedir | ~R$ |
|---|---|---|
| Placa | chapa de **alumínio ou aço**, 25×25 cm, 1 a 1,5 mm, com um **furo de 4–5 mm no centro exato** (a serralheria corta e fura) | 20–40 |
| Exciter | "transdutor exciter de áudio 20 W 4 Ω" (ou alto-falante de 6" com um parafuso colado no centro do cone) | 40–80 |
| Amplificador | módulo **TPA3116** (2×50 W) ou **PAM8610**, + **fonte 12 V 3 A** | 40–70 |
| Cabo | P2 macho → 2 RCA (ou P2 → fios) do PC até o amplificador | 10 |
| Captação | **captador piezo de contato** com saída P10, + adaptador P10 → P2 (ou uma interface de áudio USB simples) | 20–40 |
| "Poeira" | **sal fino** (o melhor). Testes: areia fina peneirada, semolina, açúcar refinado | 5 |
| Fixação | parafuso M4 de 3 cm + 2 porcas + 2 arruelas, **cola epóxi** (Durepoxi ou Araldite), plástico filme | 15 |

## 2. Montagem (~1 h, mais a cura da cola)

1. **Exciter virado para cima** sobre uma base firme (caixa de madeira, pés de borracha). Cubra com plástico filme: sal corrói.
2. **Parafuso no centro do exciter:** cole a cabeça do parafuso no centro da face que vibra com epóxi. Espere curar (24 h para resistência total).
3. **Placa no parafuso, presa só pelo centro:** arruela + porca embaixo, placa, arruela + porca em cima. Aperte bem. As bordas ficam **livres**: se encostarem em algo, não vibram.
4. **Amplificador:** fonte 12 V na entrada do módulo; saída (um canal) nos 2 fios do exciter; entrada do módulo no fone de ouvido do PC.
5. **Captador** preso no tampo do violão/violino (perto da ponte), no microfone do PC ou na interface USB.
6. Volume do amplificador **no mínimo** antes de ligar.

## 3. Usar o programa

Abra `index.html` no Chrome. Se o microfone não abrir pelo arquivo, rode na pasta `python3 -m http.server 8000` e abra `http://localhost:8000`.

1. **Ligar** e escolher a entrada do captador. Marque "Violão" para notas graves (até Mi grave, 82 Hz).
2. **Afinador:** toque uma nota; aparece a nota, a frequência e se está afinado, acima ou abaixo. Já serve para afinar mesmo sem a placa.
3. **Varredura (uma vez, para conhecer a placa):** sal espalhado bem fino. "Varrer" de 80 a 2500 Hz. Quando o sal formar um desenho nítido: **Pausar**, ajustar com −1/+1 Hz até ficar o mais nítido possível, **Marcar**. Continue. Uma placa de 25 cm costuma ter 10 a 20 ressonâncias nessa faixa.
4. **Tocar:**
   - **Seguir a nota:** a placa recebe exatamente a nota tocada. Forma desenho só quando a nota cai perto de uma ressonância.
   - **Seguir com "imã":** cada nota vai para a ressonância marcada mais próxima, então quase toda nota forma um desenho.
   - **Manual:** uma frequência fixa, para testar.
5. **Segurar a última nota:** a placa continua com a nota depois que o som do instrumento some (o desenho leva 1–3 s para se formar).

## 4. Se não funcionar

| Problema | Causa provável | O que fazer |
|---|---|---|
| Sal só pula, sem desenho | longe de uma ressonância | use a varredura e o modo "imã"; ajuste fino com ±1 Hz |
| Desenho torto, de um lado só | placa fora do centro ou borda encostando | refaça o furo no centro exato; libere as bordas |
| Nota pula / errada | microfone ouvindo a placa | use o captador piezo; afaste a placa do instrumento |
| Sem som na placa | volume baixo ou cabo | volume do PC e do amplificador; "Manual" a 300 Hz para testar |
| Muito barulho | normal em agudos | volume baixo; agudos acima de 2 kHz só de vez em quando |

## 5. Ideias para depois
- Filmar de cima (celular num tripé) para um vídeo de YouTube: "como cada nota do violino desenha no sal".
- Placa circular, que forma desenhos em anéis e raios.
- Mostrar na tela, ao lado da nota, uma foto do desenho que ela forma (guardar uma foto por ressonância marcada).
