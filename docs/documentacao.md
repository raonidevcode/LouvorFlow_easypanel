# Documentacao do LouvorFlow

Este arquivo resume o estado atual do projeto para retomar o trabalho com seguranca em uma proxima sessao.

## Objetivo do Projeto

LouvorFlow e uma aplicacao para igrejas, bandas, equipes de louvor e musicos em geral.

O foco inicial e:

- cadastrar musicas manualmente a partir de cifras copiadas;
- visualizar a musica em modo apresentacao para tocar;
- organizar biblioteca e repertorios;
- manter a experiencia fluida em desktop, tablet e mobile;
- manter compatibilidade com navegadores antigos, incluindo iOS 9 em diante.

## Stack Atual

- Monorepo com npm workspaces.
- Frontend: React, TypeScript e Vite.
- API: Node.js/Express.
- Banco definido para o projeto: SQL Server.
- Pacote compartilhado: `packages/shared`, com tipos, parser de cifra e regras musicais.

Fluxo desejado:

```text
Web App -> API -> SQL Server
```

O n8n fica reservado para automacoes futuras, como OCR de imagem/PDF, importacao em lote e integracoes externas.

## Estrutura Importante

```text
apps/web/src/main.tsx
  Interface principal, telas, editor, biblioteca e modo apresentacao.

apps/web/src/styles.css
  Layout, responsivo, visual das secoes, biblioteca, modal e cifra.

packages/shared/src/chordSheetParser.ts
  Parser que transforma texto colado da cifra em secoes e linhas.

packages/shared/src/musicTypes.ts
  Tipos principais de musica, secoes, linhas e acordes.

docs/
  Documentacao do projeto.
```

## Decisoes de Produto

- A prioridade e o cadastro manual de musicas.
- Importacao por imagem/PDF fica para uma fase posterior.
- A tela de apresentacao deve lembrar a experiencia visual do ChartBuilder, mas com layout proprio, bonito e profissional.
- No momento nao precisa de login.
- A biblioteca deve ter busca funcional e lista simples, limpa e facil de escanear.
- A aplicacao precisa evitar scroll horizontal indesejado em mobile.
- A cifra precisa preservar a integridade: acorde na posicao certa acima da letra.

## Cuidados Importantes

- Nao alterar o que ja esta funcionando sem necessidade.
- Qualquer ajuste de responsivo deve preservar a posicao das cifras.
- A previa do editor e a tela de musica aberta devem renderizar a cifra do mesmo jeito.
- O texto colado no campo de cifra deve ser interpretado de forma fiel.
- Em mobile, ao clicar numa secao da barra superior, a tela deve ancorar a secao selecionada no topo.
- O modal de ajustes de cifra fecha somente no botao `Pronto`.
- A interface deve continuar leve para navegadores antigos.

## Parser de Cifra

O parser reconhece secoes entre colchetes e associa linhas de acordes a linhas de letra.

Exemplo:

```text
[Intro] F  C/E  Dm7  G
        F  C/E  Dm7  G

[Primeira Parte]
A7M            E
    Meu Jesus, Salvador
```

Na previa, o texto `[Intro]` nao deve aparecer como parte da cifra; ele vira titulo da secao.

## Secoes e Cores

Secoes cadastradas atualmente:

| Codigo | Nome | Tipo interno | Cor |
| --- | --- | --- | --- |
| I | Intro | intro | teal |
| V / V1 / V2 | Verso | verse | roxo |
| S1 / S2 | Primeira/Segunda Parte | verse | roxo |
| Pr | Pre-Refrão | preChorus | amarelo ouro |
| R1 | Refrão | chorus | laranja |
| P | Ponte | bridge | rosa |
| In | Instrumental | instrumental | verde claro |
| It | Interludio | interlude | vermelho/terra |
| Gp | Grande Pausa | grandPause | verde escuro |
| To | Turnaround | turnaround | verde claro |
| Re | Repete | repeat | igual ao refrão |
| F | Final | ending | teal |

Aliases importantes no parser:

- `[Pr]`, `[Pre-Refrão]`, `[Pre-Refrao]`
- `[Gp]`, `[Grande Pausa]`
- `[In]`, `[Instrumental]`
- `[To]`, `[Turnaround]`
- `[Re]`, `[Repete]`

## Biblioteca

Estado atual:

- Tela `Biblioteca` com titulo centralizado.
- Botao `Nova musica`.
- Busca funcional.
- Aba unica `Todas`.
- Lista com icone, titulo, artista e BPM quando existir.
- Ajustes recentes deixaram mobile e desktop com proporcao mais equilibrada.
- Carrega musicas pela API quando disponivel, com fallback para os dados locais de exemplo.
- Na biblioteca, clicar na capa ou no titulo abre a musica no modo apresentacao.
- A acao de editar fica no botao com icone de lapis.
- O botao `+` voltou a ficar reservado para adicionar a musica em repertorio futuramente.

Regra visual:

- No desktop/tablet, a distancia entre icone da musica e titulo foi reduzida.
- No mobile, o espacamento atual esta bom e nao deve ser mexido sem necessidade.

## Modo Apresentacao

Estado atual:

- Barra superior com circulos das secoes.
- Clicar em uma secao seleciona o bloco correspondente.
- A secao selecionada mostra sublinhado na cor da secao.
- Em mobile/tablet abaixo do breakpoint, clicar na secao rola a cifra para o bloco selecionado.
- O bloco selecionado recebe borda da cor correspondente.
- Quando nao ha mudanca real de tom, a cifra original e preservada sem converter enarmonicos. Exemplo: `Bb` continua `Bb` e nao vira `A#`.

## Editor de Musica

Estado atual:

- Campos de titulo, artista, tom original, BPM e cifra.
- Botao `Cancelar` no canto inferior esquerdo da box.
- Botao `Organizar cifra` no canto inferior direito.
- A previa tem altura fixa alinhada com a box da cifra.
- A previa tem scroll vertical e horizontal quando necessario.
- Fonte da previa e do modo apresentacao foi ajustada para preservar melhor a cifra.
- Acordes/cifras renderizam em laranja (`#f70`) e bold.
- Salva a musica na API por `POST /songs` quando for nova e por `PUT /songs/:id` quando ja existir.
- Tambem funciona em modo edicao, preenchendo titulo, artista, tom, BPM e cifra original a partir de `RawChart`.

## API de Musicas

Estado atual:

- `GET /songs`: lista musicas.
- `GET /songs/:id`: busca uma musica.
- `POST /songs`: cria uma musica.
- `PUT /songs/:id`: atualiza uma musica.
- `DELETE /songs/:id`: remove uma musica.

A API usa SQL Server pela tabela `Songs`, armazenando as secoes em `SectionsJson` para manter o MVP simples e preservar a estrutura completa da cifra.

A coluna `RawChart` guarda o texto original colado pelo usuario. Ela e usada na edicao para reabrir a cifra exatamente como foi digitada, preservando espacos, quebras e indentacao.

Se o SQL Server nao estiver acessivel, `GET /songs` e `GET /songs/:id` ainda podem cair nos dados locais de exemplo. Criar, atualizar e apagar exigem banco ativo.

## Banco SQL Server

Estado atual:

- Banco usado: `LouvorFlow`.
- A conexao remota configurada no `.env` da API foi validada.
- A tabela `Songs` existe e esta em uso.
- A coluna `RawChart` ja foi criada no banco.
- Cadastro real pela tela foi testado e funcionou gravando no SQL Server.
- Edicao real pela tela foi testada e funcionou.

Tabela principal atual:

```text
Songs
  Id nvarchar(80)
  Title nvarchar(200)
  Artist nvarchar(200)
  OriginalKey nvarchar(8)
  CurrentKey nvarchar(8)
  Bpm int
  TimeSignature nvarchar(12)
  IsFavorite bit
  SectionsJson nvarchar(max)
  RawChart nvarchar(max)
  CreatedAt datetime2
  UpdatedAt datetime2
```

Observacao: `RawChart` guarda a cifra original colada/editada; `SectionsJson` guarda a versao estruturada para exibicao.

## Modal de Ajustes de Cifra

Estado atual:

- Apenas botao do tom fica visivel na tela principal.
- Modal mostra anotacoes e selecao de tom.
- Capo e busca por atualizacoes foram removidos.
- Clicar fora do modal nao fecha.
- Fecha somente pelo botao `Pronto`.

## Validacoes Recentes

Comandos usados para validar alteracoes:

```text
npm run typecheck
npm run build
```

Ambos passaram apos as ultimas alteracoes.

Observacao: o build ainda mostra um aviso conhecido do `plugin-legacy` sobre `build.target`, mas nao quebra a compilacao.

## Fechamento de 2026-07-11

Concluido hoje:

- SQL Server configurado e validado com a API.
- API respondendo em `http://localhost:3333`.
- Frontend rodando em `http://localhost:5173`.
- Biblioteca lendo musicas vindas da API.
- Cadastro manual salvando no banco.
- Edicao de musica existente funcionando.
- `RawChart` integrado no tipo `Song`, API e editor.
- Preservacao da cifra original no modo apresentacao quando o tom nao muda.
- Botoes da biblioteca separados: lapis para editar e `+` reservado para repertorio.
- `schema.sql` atualizado para incluir `RawChart` em novas instalacoes ou adicionar a coluna quando faltar.

## Fechamento de 2026-07-12

Concluido hoje:

- Tela `Repertorios` ajustada para seguir a mesma identidade visual da Biblioteca.
- Busca funcional adicionada em repertorios.
- Filtro visual com `Proximos` e `Anteriores`.
- Repertorios futuros/atuais e anteriores separados por data.
- Repertorio da data atual recebe destaque discreto com fundo suave, linha azul lateral e selo `Hoje`.
- Toda a area principal da box do repertorio ficou clicavel, mantendo tambem o botao `Abrir`.
- Botao `Novo repertorio` passou a abrir uma tela propria de cadastro de repertorio.
- Tela de cadastro de repertorio criada com:
  - `Nome do Repertorio`;
  - `Data`;
  - `Horario do Culto`;
  - `Descricao`.
- Topo da tela de repertorio criado com `Cancelar`, titulo `Repertorio` e `Pronto`.
- `Cancelar` e `Pronto` alinhados com a mesma regua visual do formulario.
- Linha inferior do topo atravessa a tela inteira.
- Campo de `Data` e campo de `Horario do Culto` alinhados corretamente.
- Responsivo da tela de cadastro de repertorio ajustado para mobile/tablet.
- Build e typecheck passaram apos os ajustes.

Observacao importante:

- A tela de cadastro de repertorio ainda e visual/local. O botao `Pronto` volta para a lista, mas ainda nao grava no SQL Server.
- A lista de repertorios ainda usa dados temporarios em memoria. A proxima etapa natural e criar tabela/API de repertorios e conectar a tela ao banco.

## Fechamento de 2026-07-13

Concluido hoje:

- Tabelas de repertorio criadas no SQL Server:
  - `Repertoires`;
  - `RepertoireSongs`.
- API de repertorios integrada:
  - listar repertorios;
  - buscar repertorio por id;
  - criar repertorio;
  - atualizar repertorio;
  - excluir repertorio.
- Tela `Repertorios` passou a carregar dados reais do banco via API.
- Cadastro de novo repertorio passou a salvar no SQL Server.
- Data e horario do repertorio foram ajustados para preservar corretamente valores cadastrados, evitando deslocamento de dia/hora.
- Lista de repertorios passou a ter scroll interno em vez de rolar a pagina toda.
- Scrollbar foi ajustada para seguir a cor do tema.
- Tela interna do repertorio criada com:
  - topo visual com nome do repertorio;
  - data por extenso;
  - horario do culto;
  - descricao quando existir;
  - aba `Musicas` centralizada;
  - lista de musicas do repertorio;
  - botao inferior para `Adicionar Musicas` quando vazio ou `Abrir Repertorio` quando houver musicas.
- Botao `Abrir Repertorio` foi reposicionado dentro do layout para nao ficar sobre a lista de musicas.
- Lista interna de musicas do repertorio ficou com scroll proprio.
- Icones das musicas no detalhe do repertorio foram alinhados ao padrao da Biblioteca:
  - mesmo tamanho base;
  - mesma margem entre icone e titulo.
- Fluxo `Adicionar Musicas` dentro de um repertorio:
  - abre a Biblioteca em modo contextual;
  - remove o botao `Nova musica`;
  - mostra o repertorio selecionado no topo;
  - permite voltar ao detalhe do repertorio pelo `x`;
  - permite adicionar musicas pelo menu de tres pontos;
  - evita duplicar musica ja adicionada.
- Fluxo de adicionar repertorio a partir de uma musica:
  - botao `+` da primeira tela inicia o fluxo;
  - menu `Adicionar ao repertorio` na Biblioteca tambem inicia o fluxo;
  - tela `Repertorios` mostra a musica selecionada no topo;
  - clicar em um repertorio existente adiciona a musica nele;
  - clicar em `Novo repertorio` cria o repertorio ja com a musica selecionada.
- Botoes visuais `Abrir` e `Adicionar` foram ocultados da lista de repertorios.
- A acao agora fica no clique do proprio card do repertorio:
  - sem musica pendente, abre o repertorio;
  - com musica pendente, adiciona a musica naquele repertorio.
- Typecheck e build passaram apos as alteracoes.

Observacoes importantes:

- O fluxo de adicionar musicas ao repertorio ja esta funcional, mas ainda falta uma experiencia mais completa de edicao interna do repertorio.
- A ordenacao de musicas no repertorio ainda usa a ordem de insercao.
- O menu de tres pontos nas musicas ainda e o ponto de entrada para editar/excluir/adicionar, mas pode evoluir depois para estados mais contextuais.
- O aviso do `plugin-legacy` no build continua conhecido e nao quebra a compilacao.

## Fechamento de 2026-07-14

Concluido hoje:

- Tela de detalhe do repertorio evoluida para modo de edicao:
  - botao `Editar` alterna para `Pronto`;
  - aparece acao `+ Adicionar Musicas`;
  - aparece botao vermelho de remover musica da lista;
  - aparecem controles de subir/descer para reorganizar a ordem das musicas.
- Remocao de musica do repertorio implementada no detalhe do repertorio.
- Reordenacao das musicas do repertorio implementada usando os botoes de subir/descer.
- Botao `+ Adicionar Musicas` mantido fixo no topo da lista em modo edicao, sem centralizar nem alterar o tamanho original.
- Menu de acoes da Biblioteca ajustado para fechar ao clicar fora.
- Biblioteca em contexto de repertorio passou a indicar musicas ja adicionadas com um check discreto no canto do icone.
- Identificador anterior em formato de etiqueta `Adicionada` foi removido.
- Lista da Biblioteca passou a ter scroll interno, seguindo o mesmo comportamento da lista de repertorios.
- Ajustes visuais de lista:
  - icones das musicas no repertorio alinhados ao padrao da Biblioteca;
  - margem entre icone e titulo ajustada;
  - espacamento entre tom e BPM ajustado com `margin-top: 5px`.
- Singular/plural corrigido para `1 musica` e `N musicas` onde aparece contagem.
- Modo ao vivo do repertorio criado/ajustado:
  - abre as musicas em sequencia;
  - permite navegar entre musicas;
  - seletor de musica/repertorio no topo;
  - modal de selecao com repertorio destacado e musica atual destacada;
  - icones do modal alinhados e padronizados;
  - lista do modal preparada para rolagem quando houver muitas musicas.
- Navegacao visual por paginas/secoes dentro da musica ajustada:
  - bolinhas ficaram dentro da area da musica;
  - posicao calculada para ficar mais proxima da parte inferior da tela em diferentes devices.
- Tela de musica avulsa ajustada para seguir a mesma regua visual do modo ao vivo:
  - titulo ao lado da seta em mobile/tablet;
  - titulo centralizado no desktop;
  - seta, circulos de mapa, botao de tom e boxes alinhados.
- Titulos das paginas principais padronizados para 25px:
  - `Pesquisar`;
  - `Biblioteca`;
  - `Repertorios`.
- Textos de botoes padronizados:
  - `Nova Musica`;
  - `Novo Repertorio`.
- Fluxo do botao `+ Repertorio` na tela de musica avulsa conectado ao fluxo existente:
  - se ja houver repertorios, abre a selecao para escolher onde adicionar;
  - se nao houver repertorio, segue para criacao de novo repertorio com a musica pendente.
- Lista de repertorios recebeu menu de tres pontos para exclusao de repertorio, seguindo o padrao visual da Biblioteca.
- Remocao dos dados mockados/de teste:
  - removido `sampleData.ts`;
  - removida exportacao de `sampleData` no pacote shared;
  - frontend inicia com listas vazias e carrega somente dados reais da API;
  - API nao usa mais fallback mockado em falha de banco, retornando lista vazia ou `null`.
- Ajuste de seguranca visual quando nao houver musica carregada:
  - tela de busca continua renderizando normalmente em base limpa.
- Typecheck passou apos os ajustes.

Observacoes importantes:

- A aplicacao agora depende dos dados reais do SQL Server para musicas e repertorios.
- Se o banco estiver vazio, a Biblioteca/Repertorios devem aparecer vazios, sem dados ficticios.
- O fluxo principal de adicionar musica ao repertorio esta funcional tanto pela Biblioteca quanto pelo botao `+ Repertorio` da musica.
- O modo ao vivo ja tem a base visual e de navegacao, mas ainda pode receber refinamentos de gestos/swipe e otimizacao fina para iOS antigo.

## Proximos Passos Sugeridos

1. Refinar o modo ao vivo para tablet/mobile:
  - gesto horizontal entre musicas;
  - navegacao entre paginas/secoes da musica;
  - desempenho em iOS 9+.
2. Definir e persistir tom/capo por musica dentro do repertorio.
3. Melhorar edicao avancada de repertorio:
  - confirmacao ao remover musica;
  - feedback visual apos reordenar;
  - estado vazio mais polido.
4. Revisar comportamento offline/cache para uso em culto sem internet.
5. Continuar testando responsivo em mobile/tablet e navegadores antigos.

## Fechamento de 2026-07-15

Concluido hoje:

- Campo de cifra ajustado para edicao em tempo real:
  - o botao `Organizar cifra` foi removido;
  - a previa passa a acompanhar automaticamente titulo, artista, tom, BPM e conteudo da cifra;
  - o fluxo de salvar continua usando a cifra original em `rawChart`.
- Parser de cifras refinado para preservar melhor a integridade do copia/cola:
  - linhas em branco dentro das secoes passaram a ser preservadas;
  - a previa agora consegue manter respiros verticais que existiam no campo `Cifra`;
  - linhas vazias sao renderizadas como espacamento real na previa e no modo de exibicao.
- Compatibilidade com iOS 9 investigada e ajustada:
  - o teste em `npm run dev` nao e confiavel para iOS 9, pois Vite dev entrega codigo moderno;
  - o caminho correto de teste para iOS 9 ficou sendo `npm.cmd run build` seguido de `npm.cmd run preview -w @louvorflow/web`;
  - o acesso no device antigo deve ser feito pelo IP da maquina na rede, usando a porta `4173`.
- Tela preta no iOS 9 tratada em etapas:
  - removido o carregamento do CodeMirror do bundle inicial;
  - campo `Cifra` voltou temporariamente para `textarea`, mantendo a edicao em tempo real;
  - `String.normalize()` recebeu protecao no `slugify`;
  - `String.normalize()` recebeu protecao no parser de secoes (`normalizeTitle`);
  - adicionada tela de erro visivel para evitar tela preta silenciosa caso outro erro antigo apareca.
- Editor de cifra separado por compatibilidade:
  - browsers modernos voltaram a usar CodeMirror;
  - iOS 9, Safari antigo e Chrome antigo no iOS usam `textarea`;
  - CodeMirror passou a ser carregado dinamicamente apenas em ambiente moderno;
  - iOS 9 nao deve baixar nem executar o CodeMirror, evitando nova tela preta.
- Apos esses ajustes, o iOS 9 passou a abrir novamente a aplicacao e a tela `Nova Musica`.
- Typecheck e build passaram apos os ajustes.

Observacoes importantes:

- As protecoes de `normalize()` sao defensivas e nao devem alterar visual nem fluxo nos devices modernos.
- A separacao atual do editor preserva CodeMirror para devices modernos e usa `textarea` apenas no fallback antigo.
- Para identificar qual editor esta rodando:
  - CodeMirror mostra elementos/classes `cm-editor`, `cm-scroller`, `cm-content`;
  - fallback antigo mostra `textarea.chartCodeEditor.chartCodeTextarea`.
- O comportamento desejado continua sendo preservar a cifra original com fidelidade maxima em `rawChart`, porque isso protege futuras funcoes como transposicao por repertorio.

Proximos passos sugeridos:

1. Testar a separacao do editor:
  - navegador moderno deve renderizar CodeMirror;
  - iOS 9/Safari antigo/Chrome antigo no iOS deve renderizar `textarea`.
2. Ajustar `API_BASE_URL` para acesso em rede:
  - evitar `localhost` no iPad/iPhone;
  - usar automaticamente o host da pagina quando possivel.
3. Continuar teste real no iOS 9:
  - abrir Biblioteca;
  - criar Nova Musica;
  - colar cifra longa;
  - salvar;
  - abrir musica ao vivo.
4. Depois disso, voltar ao refinamento do modo ao vivo e navegacao mobile/tablet.

## Fechamento de 2026-07-16

Concluido hoje:

- Preview em rede revisado para teste no iPad:
  - a aplicacao deve ser testada pelo preview de producao na porta `4173`;
  - a API continua rodando na porta `3333`;
  - o iPad antigo deve acessar pelo IP da maquina na rede, com cache-bust quando necessario, por exemplo `?v=legacy9`.
- Ajustes especificos para iOS 9 / navegadores antigos:
  - criado modo visual legado isolado por classes `legacyVisualRoot` e `legacyVisualMode`;
  - os ajustes do legado ficam separados dos estilos modernos;
  - o objetivo e manter navegacao simples e estavel no iOS 9 sem alterar a experiencia dos devices atuais.
- Tela de Biblioteca no legado:
  - fundo da aplicacao passou a ficar travado para evitar deslocamento ao rolar rapido;
  - lista passou a usar rolagem interna;
  - aba `Todas` deixou de passar por cima da lista;
  - rodape/menu inferior foi ajustado para voltar a exibir icones e textos no tamanho correto.
- Tela de Repertorios no legado:
  - aplicada a mesma base de rolagem interna e tela travada;
  - lista e rodape seguem o comportamento visual da Biblioteca.
- Tela de detalhe do repertorio:
  - ajustes no botao `Abrir Repertorio` para nao ficar escondido no mobile;
  - desktop passou a seguir a mesma logica visual do mobile/tablet para esse botao;
  - altura do cabecalho do repertorio foi reduzida para ganhar espaco util na lista;
  - seta e `Editar` foram reposicionados para alinhar melhor com a estrutura da lista.
- Tela de musica avulsa e modo ao vivo:
  - cabecalho fixo com titulo, tom e mapa de secoes;
  - conteudo da cifra rola por dentro, evitando que letra/cifra passem por cima do cabecalho;
  - modo ao vivo recebeu a mesma ideia de rolagem interna sem quebrar a navegacao lateral entre musicas;
  - modal de tom foi ajustado para ficar acima do cabecalho fixo;
  - texto `Tom Original` foi protegido para nao quebrar linha no modal.
- Cadastro de musica:
  - no mobile/tablet, a tela recebeu rolagem interna;
  - barra superior com titulo e botao `Salvar` ficou fixa.
- Rodape mobile/tablet:
  - ajustado para ficar mais parecido com app instalado, com respiro inferior;
  - fonte do menu inferior ajustada para melhor leitura abaixo de tablet;
  - revisado em telas com Biblioteca, Repertorios e detalhe de repertorio.
- Ajustes finos de layout:
  - titulos principais das paginas aumentados para `25px`;
  - textos de botoes padronizados como `Nova Musica` e `Novo Repertorio`;
  - margem entre icone da musica e titulo reduzida na lista;
  - detalhes de singular/plural corrigidos em contagem de musicas.

Observacoes importantes:

- O modo moderno deve continuar usando os layouts aprovados e CodeMirror no editor de cifra.
- O modo legado deve continuar usando `textarea` e estilos isolados para iOS 9 / Chrome antigo no iOS.
- Ao testar em iPad antigo, sempre considerar cache do navegador. Se uma mudanca visual nao aparecer, usar uma URL com novo parametro, por exemplo `?v=legacy10`.
- O ponto ainda em refinamento no legado e a centralizacao perfeita das letras dentro dos circulos do mapa de secoes na musica avulsa. A proxima sessao deve continuar por esse ajuste, mexendo apenas no CSS/markup protegido por `.legacyVisualMode`.

Proximos passos sugeridos:

1. Finalizar o alinhamento das letras dentro dos circulos no modo legado, sem afetar o moderno.
2. Testar Biblioteca, Repertorios, musica avulsa e modo ao vivo no iPad iOS 9 com cache-bust.
3. Validar novamente mobile moderno no Motorola Edge 40:
  - rodape;
  - botao `Abrir Repertorio`;
  - rolagem interna;
  - cabecalho fixo da musica.
4. Depois da estabilidade visual, seguir para refinamentos funcionais do modo ao vivo e repertorios.

## Atualizacao de 2026-07-17

Concluido nesta rodada:

- Modo legado:
  - ajustes finos no cabecalho da musica avulsa;
  - ajustes finos no cabecalho do modo ao vivo;
  - titulo, seta, botao de tom, tres pontos e mapa de secoes foram aproximados visualmente entre modo avulso e modo ao vivo;
  - os ajustes continuaram isolados em `.legacyVisualMode`, sem alterar o modo moderno.
- Modo moderno:
  - revisado cabecalho da musica avulsa e do modo ao vivo em mobile/tablet;
  - seta e titulo passaram a funcionar como grupo visual no canto esquerdo;
  - botao de tom permanece no canto direito;
  - seta recebeu `font-size: 44px`;
  - padding lateral da seta foi removido;
  - foi removido o ajuste de `margin-left: -2px`;
  - no modo ao vivo, o `.liveBackButton` passou a usar alinhamento a esquerda no modo moderno para ficar mais proximo do comportamento visual do botao de tom.
- Modo ao vivo moderno:
  - mantido respiro maior entre os circulos do mapa de secoes e a borda cinza inferior;
  - mantido cuidado para nao alterar a navegacao lateral entre musicas.

Observacoes importantes:

- O modo legado continua separado do moderno. Ajustes modernos usam seletores com `.appShell:not(.legacyVisualMode)`.
- Ao testar no celular ou iPad, continuar usando cache-bust na URL quando houver alteracao visual, por exemplo `?v=arrow-modern-2`.
- O ultimo build executado passou com sucesso usando:
  - `npm.cmd run build -w @louvorflow/web`

Proximos passos sugeridos:

1. Validar no Motorola Edge 40:
  - seta e titulo no modo avulso;
  - seta e titulo no modo ao vivo;
  - respiro entre circulos e borda cinza no modo ao vivo.
2. Validar no iPad iOS 9 se os ajustes do legado continuam estaveis.
3. Se o alinhamento visual estiver aprovado, seguir para os proximos refinamentos funcionais do repertorio/modo ao vivo.

## Atualizacao de 2026-07-19

Concluido nesta rodada:

- Navegacao da musica avulsa:
  - a seta de voltar da tela de musica avulsa agora retorna para `Biblioteca`;
  - o comportamento vale para modo moderno e legado, em desktop, tablet e mobile;
  - tambem foi coberto o caso de musica aberta por link direto.
- Detalhe do repertorio:
  - ao clicar em uma musica dentro do repertorio, a aplicacao agora abre o modo ao vivo do repertorio;
  - o modo ao vivo continua iniciando pela primeira musica da lista, igual ao botao `Abrir Repertorio`;
  - nao foi criado estado novo para isso;
  - em modo de edicao, o clique da linha continua preservado para nao atrapalhar remover/reordenar musicas.
- Cadastro/edicao de musica:
  - `rawChart` continua sendo salvo intacto, fiel ao texto colado/digitado;
  - as `sections` geradas para exibicao agora passam por `normalizeDisplaySections(parseChordSheet(rawChart))`;
  - a normalizacao remove linhas vazias no comeco da secao;
  - tambem remove uma linha vazia no final da secao, evitando que o separador natural entre `[Intro]` e `[Verso]` vire espaco extra dentro do card;
  - a mudanca deixa previa, musica avulsa e modo ao vivo usando a mesma estrutura visual normalizada.
- Limpeza de teste:
  - foi criada uma pagina temporaria para validar o espacamento da previa;
  - apos aprovacao visual, a rota de teste, o componente de teste e o CSS temporario foram removidos;
  - nao ficou referencia a `chart-spacing-test` nem a `.spacingTestPreviewChart`.
- Cards de cifra:
  - o espacamento abaixo do cabecalho da secao (`.sectionCard header`) foi ajustado para `20px`;
  - o valor foi aplicado na regra base e nos overrides responsivos;
  - isso afeta de forma consistente a previa do cadastro/edicao, a musica avulsa e o modo ao vivo.

Observacoes importantes:

- A normalizacao das `sections` acontece no cadastro/edicao. Musicas antigas so recebem esse novo formato depois de editadas e salvas novamente.
- O modo legado tambem exibe as mesmas `sections`, entao musicas novas/editadas aparecem normalizadas nele tambem.
- O parser global nao foi alterado; isso reduz impacto em fluxos antigos e evita mudar dados ja existentes sem acao do usuario.
- O ultimo build executado passou com sucesso usando:
  - `npm.cmd run build -w @louvorflow/web`

Proximos passos sugeridos:

1. Testar uma musica nova com linhas vazias entre secoes:
  - confirmar que a previa nao cria espaco extra falso;
  - salvar e abrir a musica avulsa;
  - adicionar ao repertorio e abrir no modo ao vivo.
2. Testar uma musica editada existente:
  - confirmar que `rawChart` permanece fiel;
  - confirmar que a exibicao fica normalizada apos salvar.
3. Validar no moderno e no legado:
  - cadastro/edicao;
  - musica avulsa;
  - modo ao vivo.

## Atualizacao de 2026-07-20

Concluido nesta rodada:

- Sincronizacao automatica inicial:
  - foi criada a rota `GET /sync/version` na API;
  - o frontend passou a consultar essa rota automaticamente a cada `15s`;
  - quando a assinatura de dados muda, a aplicacao recarrega musicas e repertorios;
  - o fluxo foi testado criando musica em um aparelho e a lista atualizou no outro aparelho.
- API:
  - criado `apps/api/src/routes/sync.ts`;
  - criado `apps/api/src/repositories/syncRepository.ts`;
  - `server.ts` passou a registrar a rota `/sync`.
- Assinatura de sincronizacao:
  - inicialmente usava `MAX(UpdatedAt)` e contagem de registros;
  - foi reforcada com `checksum_agg(binary_checksum(...))`;
  - isso cobre edicoes de musica avulsa, incluindo titulo, artista, tom, bpm, cifra bruta e secoes;
  - tambem cobre repertorios e vinculos entre repertorio e musica.
- Frontend:
  - os carregamentos de `/songs` e `/repertoires` foram organizados em funcoes reutilizaveis;
  - o polling atualiza os dados sem trocar a navegacao atual do usuario;
  - se a musica selecionada ainda existir, a selecao e mantida;
  - se a musica selecionada for removida, a aplicacao escolhe a primeira musica disponivel.

Observacoes importantes:

- Esta etapa ainda nao adicionou WebSocket.
- O polling funciona tanto no modo moderno quanto no legado/iOS antigo.
- Nao houve alteracao de CSS/layout nesta etapa.
- Para a API pegar a mudanca, e necessario que ela reinicie ou esteja rodando com `tsx watch`.
- Validacoes executadas com sucesso:
  - `npm.cmd run typecheck -w @louvorflow/api`;
  - `npm.cmd run build -w @louvorflow/api`;
  - `npm.cmd run typecheck -w @louvorflow/web`;
  - `npm.cmd run build -w @louvorflow/web`.

Proxima etapa sugerida:

1. Implementar WebSocket para navegadores modernos:
  - modernos tentam WebSocket primeiro;
  - se WebSocket cair, polling assume automaticamente;
  - legado/iOS antigo continua somente com polling.
2. Testar com dois aparelhos:
  - criar musica;
  - editar musica avulsa;
  - excluir musica;
  - criar/editar/excluir repertorio;
  - adicionar/remover/reordenar musica dentro do repertorio.
3. Depois da sincronizacao em tempo real ficar estavel, seguir para busca escalavel por `Title`, `Artist` e `RawChart`, com Full-Text Search se a hospedagem liberar.

## Atualizacao de 2026-07-21

Concluido nesta rodada:

- Autenticacao e protecao de escrita:
  - a API passou a exigir login em `POST`, `PUT` e `DELETE` de musicas;
  - a API passou a exigir login em `POST`, `PUT` e `DELETE` de repertorios;
  - endpoints de leitura (`GET`) continuam livres para navegacao/consulta;
  - no frontend moderno, erro `401` em acao de escrita limpa a sessao local, fecha dialogs de exclusao e envia o usuario para a tela de login;
  - a tela de login mostra o aviso `Entre novamente para continuar.` quando a sessao expira.
- Regra de biblioteca global:
  - musicas da biblioteca passaram a ser globais;
  - qualquer usuario logado consegue listar/pesquisar/abrir as musicas da biblioteca;
  - a pagina Pesquisar usa essa mesma lista global de musicas.
- Regra de repertorios por workspace:
  - repertorios continuam vinculados ao workspace da sessao;
  - cada usuario/equipe ve somente os repertorios do seu workspace;
  - as musicas adicionadas ao repertorio podem vir da biblioteca global;
  - o vinculo `RepertoireSongs` valida que o repertorio pertence ao workspace atual e que a musica existe.
- Sincronizacao:
  - mudancas em musicas entram na assinatura global de sync;
  - mudancas em repertorios e vinculos continuam dentro do workspace atual.

Arquivos principais alterados:

- `apps/api/src/routes/songs.ts`
- `apps/api/src/routes/repertoires.ts`
- `apps/api/src/repositories/songRepository.ts`
- `apps/api/src/repositories/repertoireRepository.ts`
- `apps/api/src/repositories/syncRepository.ts`
- `apps/web/src/main.tsx`

Regra de negocio atual:

- Biblioteca musical = acervo compartilhado para todos.
- Repertorios = dados particulares do workspace/equipe.
- Configuracoes de uma musica dentro do repertorio, como tom, capo, ordem e observacao, devem ficar no vinculo do repertorio, nao na musica global.
- Exclusao/edicao global de musica ainda precisa de regra de permissao antes de ficar definitiva, porque pode afetar todos os usuarios.

Validacoes executadas com sucesso:

- `npm.cmd run typecheck -w @louvorflow/api`
- `npm.cmd run build -w @louvorflow/api`
- `npm.cmd run typecheck -w @louvorflow/web`
- `npm.cmd run build -w @louvorflow/web`

Proxima etapa preparada:

1. Evoluir usuarios/workspaces reais:
  - criar fluxo/tabela para usuarios reais alem do `default-user`;
  - manter `workspace` associado a cada login;
  - preparar papel `master` da aplicacao com todas as permissoes.
2. Definir permissoes:
  - `master`: pode editar/excluir musicas globais e administrar usuarios/workspaces;
  - usuario comum: pode criar/editar seus repertorios e usar musicas globais;
  - avaliar se usuario comum pode sugerir/criar musica global ou se isso passa por aprovacao.
3. Revisar exclusao de musica global:
  - antes de excluir, verificar se a musica esta em repertorios;
  - definir se exclui para todos, bloqueia, arquiva ou exige permissao `master`.

## Lembrete pendente - gestao de usuarios

Etapa para lembrar na proxima retomada:

- Criar area para o `IsAppMaster` gerenciar usuarios cadastrados.
- Usuarios criados pelo cadastro publico entram automaticamente como `viewer`.
- O master da aplicacao deve poder promover usuario para `member`.
- Incluir recurso para desativar/reativar usuario:
  - banco: campo como `IsActive` ou `DisabledAt`;
  - login deve bloquear usuario desativado;
  - checagem de sessao deve derrubar usuario que foi desativado enquanto estava logado;
  - acao disponivel somente para `IsAppMaster`.
- Master nao deve visualizar repertorios/workspaces de outros usuarios por causa disso.
- Como novos cadastros criam workspace proprio, a gestao precisa listar usuarios globalmente com seu workspace, sem abrir dados internos do repertorio.
- Sugestao tecnica:
  - backend: rota global protegida por `IsAppMaster` para listar usuarios/workspaces;
  - backend: rota protegida por `IsAppMaster` para alterar role do usuario no workspace dele;
  - frontend: secao discreta na tela Conta apenas para `user.isAppMaster`.

## Atualizacao de 2026-07-22

Concluido nesta rodada:

- Ajustes de sessao e refresh:
  - a tela Conta passou a exibir `Sincronizando sessao...` com spinner azul durante a validacao da sessao, sem piscar os cards de usuario/workspace;
  - o estado de carregamento foi separado entre usuario deslogado e usuario logado;
  - quando a sessao troca de usuario, as telas limpam dados sensiveis do usuario anterior e recarregam o contexto correto;
  - o botao `Ir para biblioteca` foi removido da tela Conta, ja que o menu inferior cobre essa navegacao.
- Permissoes e carregamento:
  - corrigido o flicker de botoes de acao durante refresh para `viewer`, `member` e `master`;
  - botoes como `Nova Musica`, `Novo Repertorio` e `Adicionar Musicas` ficam escondidos enquanto a sessao/permissao ainda esta sendo sincronizada;
  - modo legado permanece como navegacao/leitura simples, sem expor acoes de escrita.
- Detalhe do repertorio:
  - durante refresh ou carregamento lento, a tela mostra `Sincronizando repertorio...` no lugar de estados vazios temporarios;
  - o texto `Adicione musicas para o repertorio.` e o botao `Adicionar Musicas` nao aparecem enquanto os dados ainda estao carregando;
  - a aba `Musicas` foi alinhada no estado normal e no estado de sincronizacao, incluindo ajuste especifico para modo legado.
- Musica avulsa e ao vivo:
  - musica avulsa passou a mostrar `Sincronizando musica...` quando aberta diretamente e ainda esta carregando;
  - modo ao vivo usa `Sincronizando repertorio...` quando precisa reconstruir o repertorio apos refresh;
  - os textos e spinners desses estados foram padronizados com o carregamento das listas.
- TypeScript/configuracao:
  - removida a configuracao antiga `moduleResolution: Node` do `tsconfig.base.json`;
  - API e shared passaram a usar `module`/`moduleResolution` `Node16`;
  - web passou a usar `moduleResolution: Bundler`;
  - corrigido o aviso de `rootDir` no `apps/api/tsconfig.json`.

Validacoes executadas com sucesso:

- `npm.cmd run typecheck -w @louvorflow/api`
- `npm.cmd run build -w @louvorflow/api`
- `npm.cmd run typecheck -w @louvorflow/web`
- `npm.cmd run build -w @louvorflow/web`
- `npm.cmd run typecheck`
- `npm.cmd run build`

Observacao conhecida:

- O build ainda mostra o aviso do `@vitejs/plugin-legacy` sobre `build.target`. Nao quebrou a build; depois podemos ajustar a configuracao do plugin para usar `targets` explicitamente.

Observacao critica sobre edicao de arquivos:

- O arquivo `apps/web/src/main.tsx` concentra grande parte dos textos, icones e fluxos do front. Em 2026-07-22 ele foi salvo uma vez com encoding incorreto ao usar PowerShell antigo para regravar o arquivo inteiro, causando mojibake na interface.
- Regra para evitar repetir o problema:
  - nao regravar `main.tsx` inteiro com `Get-Content`/`Set-Content` do Windows PowerShell 5;
  - preferir `apply_patch` para mudancas pontuais;
  - se precisar de script, ler e gravar explicitamente em UTF-8 sem BOM;
  - depois de editar, validar com busca por sequencias tipicas de mojibake e pelo caractere de substituicao Unicode;
  - rodar `npm.cmd run typecheck -w @louvorflow/web` e, quando a alteracao for de front, `npm.cmd run build -w @louvorflow/web`.

Estado atual das regras:

- Musicas da biblioteca continuam globais e pesquisaveis por todos.
- Repertorios continuam vinculados ao workspace da sessao.
- Usuario `viewer` apenas navega/visualiza.
- Usuario `member` pode criar e gerenciar seus repertorios e adicionar/remover musicas neles.
- `master` tem papel de controle da aplicacao, mas nao deve visualizar automaticamente os repertorios/workspaces dos outros usuarios.

Proxima etapa sugerida:

1. Criar a area de gestao de usuarios para o `IsAppMaster`.
2. Permitir ao master listar usuarios cadastrados e alterar role (`viewer`/`member`).
3. Depois disso, revisar permissoes finas de edicao/exclusao de musicas globais.

## Atualizacao de 2026-07-24

Concluido nesta rodada:

- Pesquisa:
  - a secao `Favoritas` passou a usar ranking real das musicas mais adicionadas em repertorios;
  - na aba `Todas`, `Favoritas` exibe uma previa limitada;
  - na aba `Favoritas`, a lista fica completa e sem o titulo/acao `Ver Tudo`;
  - a secao `Top Artistas` passou a agrupar artistas por musicas cadastradas/uso em repertorios;
  - na aba `Todas`, `Top Artistas` continua como rail horizontal com titulo e `Ver Tudo`;
  - na aba `Artistas`, a lista fica completa, sem titulo/`Ver Tudo` e sem o estilo de scroll horizontal;
  - adicionados estados de carregamento com spinner e texto para `Carregando musicas favoritas...` e `Carregando artistas...`.
- Atualizacao automatica:
  - rankings de favoritas e artistas entram no fluxo de atualizacao automatica por WebSocket/polling;
  - a atualizacao recalcula o ranking no backend, em vez de apenas inserir qualquer item novo na tela.
- Repertorio:
  - cadastro de novo repertorio passou a iniciar com horario atual preenchido;
  - corrigido o caso de repertorio criado hoje, perto do horario atual, nao aparecer corretamente em `Proximos` ou `Anteriores`.
- Modo legado:
  - corrigido scroll do modal de troca de musica no modo ao vivo;
  - registrado cuidado para novas telas legadas: validar sempre se a pagina nao desloca ao puxar o scroll;
  - ajustado `Top Artistas` na aba `Todas` do modo legado:
    - evitado encolhimento/corte dos cards no flex antigo;
    - mantido ajuste isolado em `.legacyVisualMode`;
    - ajustado card, margem e tamanho visual do circulo para iPad antigo;
    - valores atuais nos breakpoints legados principais:
      - base: card `180px`, margem `20px`;
      - ate `900px`: card `132px`, margem `16px`, circulo `112px`;
      - ate `760px`: card `116px`, margem `14px`, circulo `100px`.

Validacoes executadas com sucesso:

- `npm.cmd run typecheck`

## Atualizacao de 2026-07-27 - sincronizacao da lista de repertorios

Concluido nesta rodada:

- Lista de repertorios:
  - ajustada a chave de sincronizacao/cache da tela de `Repertorios`;
  - a aba `Proximos` agora invalida e recarrega somente quando muda algum repertorio de hoje ou futuro;
  - a aba `Anteriores` agora invalida e recarrega somente quando muda algum repertorio passado;
  - criar um repertorio novo nao forca mais atualizacao da aba `Anteriores`;
  - a separacao respeita a data do repertorio, usando a mesma regra visual das abas.

Impacto controlado:

- Nao foi alterado o fluxo de criar, editar, abrir, adicionar musicas ou excluir repertorios.
- Nao foi alterada a paginacao por cursor da lista.
- Nao foi alterado o comportamento visual das abas.
- O ajuste ficou concentrado na tela de `Repertorios`, apenas na logica que decide quando recarregar o periodo ativo.

Biblioteca - concluido hoje:

- Busca de musicas:
  - evoluida para buscar por `Title`, `Artist` e `RawChart`;
  - preparada para usar Full-Text Search quando disponivel no SQL Server;
  - mantido fallback com `LIKE` para ambientes sem Full-Text ou em caso de erro controlado;
  - busca com suporte a termos parciais no titulo/artista quando necessario.
- Lista da Biblioteca:
  - implementada paginacao por cursor para evitar carregar todas as musicas de uma vez;
  - carregamento inicial limitado e novos itens carregados conforme o usuario rola a lista;
  - cache em memoria mantem a lista ja carregada ao sair e voltar para a Biblioteca, evitando recarregamento desnecessario;
  - as acoes existentes de editar, adicionar ao repertorio e excluir nao foram alteradas.
- Atualizacao automatica:
  - a Biblioteca continua recebendo atualizacoes automaticas por WebSocket/polling;
  - quando uma musica nova entra, a lista invalida de forma controlada para refletir os dados novos sem mudar o fluxo visual aprovado.
- Layout/carregamento:
  - mantidos os estados de carregamento com spinner e texto padronizado;
  - ajustes feitos sem alterar a navegacao, rodape, permissoes ou layout ja aprovado da lista.

Validacoes executadas com sucesso:

- `npm.cmd run typecheck`
- `npm.cmd run build`

## Atualizacao de 2026-07-27

Concluido nesta rodada:

- Banco de dados:
  - criado o script `database/sqlserver/fulltext.sql` para preparar Full-Text Search em homologacao e producao;
  - o script valida se o Full-Text esta instalado no SQL Server;
  - habilita Full-Text no banco quando necessario;
  - cria o catalogo `LouvorFlowFullText` se ainda nao existir;
  - identifica automaticamente a chave primaria de `dbo.Songs`;
  - cria o indice Full-Text em `Title`, `Artist` e `RawChart` com `LANGUAGE 1046` e `CHANGE_TRACKING AUTO`;
  - inclui consultas finais de validacao do Full-Text.

Ordem recomendada para banco novo:

1. Rodar `database/sqlserver/schema.sql`.
2. Rodar `database/sqlserver/seed.sql`, se precisar criar dados iniciais.
3. Rodar `database/sqlserver/fulltext.sql`.
4. Validar se `IsFullTextInstalled`, `IsFulltextEnabled` e o indice de `dbo.Songs` retornam ativos.

Observacao:

- Se o banco de producao for criado copiando apenas tabelas/dados, o Full-Text provavelmente precisa ser recriado rodando `fulltext.sql`.
- Se for feito backup/restore completo, o Full-Text pode ir junto, mas ainda assim deve ser validado apos restaurar.

Observacao critica registrada:

- O arquivo `apps/web/src/main.tsx` nao deve ser regravado inteiro por scripts/PowerShell antigo.
- Se algum trecho do `main.tsx` precisar ser restaurado ou alterado, usar `apply_patch` pontual e verificar mojibake antes de finalizar.
- Em 2026-07-24, parte das mudancas de ranking de `Favoritas`/`Top Artistas` dependia de trechos em `main.tsx`; ao remover esse arquivo do versionamento temporariamente, era necessario restaurar apenas os trechos funcionais, sem regravar o arquivo completo.

Proxima etapa sugerida:

1. Retomar area de gestao de usuarios para `IsAppMaster`.
2. Implementar desativacao/reativacao de usuarios.
3. Revisar permissoes finas para edicao/exclusao de musicas globais.

## Atualizacao de 2026-07-25

Concluido nesta rodada:

- Modo moderno - musica avulsa e modo ao vivo no desktop:
  - desktop passou a seguir a mesma estrutura visual aprovada em mobile/tablet, com header fixo e area interna de scroll;
  - corrigido o scroll da musica avulsa e do modo ao vivo apos a adaptacao do layout desktop;
  - musica ao vivo recebeu ajustes finos de espacamento no desktop:
    - `.repertoireLiveScreen` com padding inferior menor;
    - `.livePageDots` ajustado para ficar mais proximo da base;
    - `.liveChartViewport` com `padding: 22px 12px 20px` em desktop moderno;
    - `.sectionRail.liveSectionRail` com margem `15px auto 0`;
    - gap da rail do modo ao vivo em desktop/tablet moderno ajustado para `15px`, sem alterar mobile.
- Modo moderno - musica avulsa no desktop:
  - `.songStickyHeader` em desktop moderno ajustado para `margin: 0 auto 0`;
  - `.songStickyHeader > .sectionRail` em desktop moderno ajustado para:
    - `gap: 15px`;
    - `margin: 15px auto 0`;
    - `padding-bottom: 24px`;
    - `border-bottom: 1px solid rgba(255, 255, 255, .06)`;
  - `.songChartViewport` em desktop moderno recebeu `padding: 22px 12px 20px`;
  - o clique nos circulos das secoes da musica avulsa no desktop moderno passou a usar o mesmo calculo do modo ao vivo, levando em conta o topo do viewport interno e o `paddingTop`, para posicionar a secao no topo util da cifra.

Cuidados mantidos:

- As mudancas desta rodada foram isoladas no modo moderno desktop usando `.appShell:not(.legacyVisualMode)` e `@media (min-width: 901px)`.
- Mobile/tablet e modo legado nao foram alterados nesses ajustes.
- A `.sectionRail` global nao foi modificada para evitar impacto em outras telas.
- O arquivo `apps/web/src/main.tsx` foi alterado apenas com `apply_patch` pontual, mantendo o cuidado contra mojibake/encoding.

Validacoes executadas com sucesso:

- `npm.cmd run typecheck`
