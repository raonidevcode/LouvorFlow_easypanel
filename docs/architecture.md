# Arquitetura inicial

## Objetivo do MVP

Criar uma aplicacao web fluida para:

- pesquisar musicas
- visualizar cifras em modo apresentacao
- transpor tom em tempo real
- montar repertorios
- cadastrar musicas manualmente

## Decisoes

### Banco

O sistema usara SQL Server como banco principal.

### API

O frontend nao acessa o banco direto. Ele conversa com uma API propria em Node.js/Express.

```text
Web App -> API -> SQL Server
```

### n8n

O n8n fica reservado para automacoes futuras:

- OCR de imagem/PDF
- importacao em lote
- integracoes externas
- notificacoes

### Transposicao

O motor de transposicao vive no pacote `packages/shared`, para ser usado no frontend e na API.

No modo apresentacao, a transposicao acontece primeiro no frontend para manter a interface instantanea. A API salva a preferencia depois.

## Estrutura

```text
apps/web
  Interface React, Vite e CSS compatível com navegadores antigos.

apps/api
  API Express, conexao SQL Server e endpoints.

packages/shared
  Tipos, dados de exemplo e regras musicais.

database/sqlserver
  Schema e seed inicial.
```

## Compatibilidade

O frontend evita recursos que costumam dar problema em Safari/iOS antigo:

- CSS Grid como base de layout
- variaveis CSS obrigatorias
- backdrop-filter
- APIs modernas no fluxo principal

O build usa plugin legacy para gerar saida compatível com Safari/iOS antigos.
