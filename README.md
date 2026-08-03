# LouvorFlow

Sistema web para biblioteca de musicas, cifras, transposicao e repertorios, com foco em equipes de louvor e musicos.

## Stack

- Frontend: React + TypeScript + Vite com build legacy
- Backend: Node.js + Express
- Banco: SQL Server
- Automacoes futuras: n8n para OCR, importacoes e integracoes

## Como rodar

Instale Node.js 20 LTS ou superior. Depois:

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:3333`

## Variaveis da API

Copie `apps/api/.env.example` para `apps/api/.env` e ajuste a conexao do SQL Server.

## Compatibilidade visual

O frontend foi desenhado com CSS simples, Flexbox e build legacy para facilitar suporte a navegadores antigos, incluindo Safari/iOS antigos. Evitamos depender de CSS Grid, variaveis CSS e APIs modernas no fluxo principal.
