# MVP v1

## Telas

1. Pesquisar
2. Biblioteca
3. Repertorios
4. Modo apresentacao da musica
5. Ajustes de cifra

## Fluxo principal

1. Usuario abre busca ou biblioteca.
2. Escolhe uma musica.
3. Entra no modo apresentacao.
4. Navega por secoes.
5. Toca no tom atual.
6. Ajusta tom/capo.
7. A cifra transpõe imediatamente.

## Fase seguinte

- Editor manual para colar cifra textual.
- Evoluir parser de secoes e acordes com revisao visual.
- Persistencia completa de repertorios.
- Importacao imagem/PDF via OCR e revisao humana.

## Parser inicial

A base ja inclui `parseChordSheet`, que reconhece:

- `[Intro]`
- `[Verso 1]`
- `[Refrao]`
- `[Ponte]`
- linhas contendo somente acordes
- linha seguinte como letra associada aos acordes anteriores
