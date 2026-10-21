# Dashboard Regional SP6

Dashboard para acompanhamento de auditorias regionais, com foco em leitura, pendência, acertabilidade e evolução por loja. O sistema permite importar consolidados em planilha, visualizar o desempenho por dia/semana e manter o histórico localmente no navegador.

## Visão geral

Este projeto foi pensado para apoiar o acompanhamento operacional da Regional SP6, centralizando dados de lojas e permitindo:

- importar planilhas de consolidados de auditorias;
- visualizar indicadores por loja e por regional;
- acompanhar leitura, pendência e acertabilidade;
- comparar evolução ao longo da semana;
- exportar e importar backups locais do histórico;
- manter todos os dados no navegador via IndexedDB.

## Stack

- Vue 3
- Vite
- Vue Router
- Tailwind CSS
- xlsx
- Font Awesome

## Funcionalidades principais

### Dashboard de auditorias
- visão consolidada da regional;
- filtros por loja;
- ranking por desempenho;
- métricas principais em cards;
- projeção de fechamento da auditoria;
- tabela de resultado por loja com ordenação;
- alerta de lojas fora da meta em semanas seguidas;
- importação de várias planilhas de uma vez (data lida da planilha ou do nome do arquivo);
- confirmação antes de excluir e avisos na tela após cada ação.

### Relatórios
- comparação de lojas por pendência, leitura e acertabilidade;
- seleção por período;
- séries históricas por data;
- identificação de destaque e desempenho relativo;
- mini gráfico de evolução por loja no ranking;
- ranking em Excel e imagens em alta resolução.

### Configurações
- lojas de cada regional;
- meta e limite de atenção (padrão 3% e 7%);
- tema claro, escuro ou igual ao sistema.

### Backup e histórico
- exportação do histórico em JSON;
- importação de backups anteriores;
- persistência local em IndexedDB.

## Estrutura do projeto

```bash
.
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── lib/
│   ├── router/
│   ├── views/
│   ├── App.vue
│   ├── main.js
│   └── style.css
├── index.html
├── package.json
├── postcss.config.js
├── vite.config.js
└── README.md
```

## Requisitos

- Node.js 18+
- npm

## Instalação

```bash
npm install
```

## Execução local

```bash
npm run dev
```

A aplicação ficará disponível em:

```bash
http://localhost:5173
```

## Build de produção

```bash
npm run build
```

Os arquivos compilados serão gerados na pasta `dist/`.

## Observações importantes

- Os dados das auditorias são armazenados localmente no navegador via IndexedDB.
- O sistema foi pensado para receber planilhas de consolidados do tipo regional, com colunas relacionadas a itens em estoque, não lidas, atualizadas e desatualizadas.
- O fluxo de importação valida a estrutura do arquivo e identifica apenas lojas permitidas para a Regional SP6.

## Licença

Este projeto é de uso interno e pessoal, sem uma licença pública definida.
