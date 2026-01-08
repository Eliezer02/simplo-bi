# Documentação Técnica - Simplo BI IA

Este documento descreve a arquitetura, lógica de negócios e decisões técnicas tomadas para o sistema de gestão de IA e análise de CRM.

## 🛠 Tecnologias Usadas
- **Frontend**: React (Vite), TypeScript, React Bootstrap, Lucide React, Axios, PapaParse.
- **Backend**: Node.js (Express), TypeScript, Multer, OpenAI API (GPT-4o), Google Generative AI (Gemini 1.5).
- **Banco de Dados**: Supabase (PostgreSQL).

## 🧠 Lógicas de Negócio Críticas

### 1. Funções de Análise e IA
- **`generateAnalyticalProfile(userId)`**: A função core de BI. Ela varre as oportunidades e gera um objeto consolidado (resumo, funis, vendedores, geografias).
- **Consumo de Tokens**: Para evitar enviar milhares de linhas para a IA (o que seria caro e lento), enviamos apenas este "Perfil Analítico" sintetizado no endpoint `/api/analyze`.
- **Tool-Calling (`analisar_dados_complexos`)**: Quando o usuário faz perguntas específicas no chat, a IA chama esta ferramenta que filtra os dados no Supabase antes de processar, mantendo o contexto limpo e eficiente.

### 2. Deduplicação Determinística (Hashing)
Diferente de sistemas que usam o índice da linha, o Simplo BI utiliza um **hash baseado em conteúdo**. 
- **Signature**: `${userId}-${protocolo}-${nome_cliente}-${data_criacao}-${valor}`
- **Vantagem**: Se o cliente subir a mesma planilha com linhas em ordens diferentes ou com novas linhas no meio, o sistema detecta as duplicatas e realiza o `upsert` apenas onde necessário, sem duplicar registros no banco.

### 3. Sistema de Lotes (Batch ID)
Cada operação de upload gera um `batch_id` único (UUID v4).
- Todas as linhas importadas em uma sessão são marcadas com este ID.
- Isso permite a funcionalidade de **Reversão (Histórico)**, onde o usuário pode deletar um arquivo específico sem afetar o restante da base de dados.

### 4. Tradutor de Colunas (Fuzzy Mapping)
O sistema não exige que a planilha tenha nomes de colunas pré-definidos.
- **Detecção**: O frontend lê os headers e abre um modal de mapeamento.
- **Normalização**: O backend recebe esse mapeamento e converte campos como `CODE_ID` ou `VALOR_BRUTO` para os atributos internos (`protocolo`, `valor`).

## 🗄 Estrutura do Banco de Dados (Supabase)

### Tabela `oportunidades`
- `unique_hash` (TEXT, PK): Hash determinístico.
- `batch_id` (UUID): ID do lote de importação.
- `user_id` (UUID): Vínculo com o usuário.
- `valor`, `vendedor`, `status`, etc.

### Tabela `import_history`
- `id` (UUID, PK): O Batch ID.
- `user_id` (UUID).
- `file_name` (TEXT).
- `rows_count` (INTEGER).
- `created_at` (TIMESTAMP).

## 🔑 Configurações e Chaves
As chaves de API **não devem ser hardcoded**. Elas residem no arquivo `backend/.env`:
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: Conexão com o banco.
- `OPENAI_API_KEY` / `GOOGLE_API_KEY`: Provedores de IA.

## 🎨 Design e UI (Style Guide)
O sistema utiliza um tema "Glassmorphism Lite" baseado em:
- **Cor Primária**: `#0d6efd` (Blue Bootstrap).
- **Fundo**: `#f8f9fa` (Light Gray).
- **Tipografia**: Inter / Sans-serif padrão do Bootstrap.
- **Ícones**: Lucide React.

## ⚠️ O que NÃO fazer
1. **Alterar a Signature do Hash**: Mudar os campos usados no MD5 (`unique_hash`) fará com que toda a base de dados suba duplicada na próxima importação.
2. **Subir segredos para o Git**: O `.env` deve estar sempre no `.gitignore`.
3. **Enviar JSON cru para a IA**: Sempre use o `generateAnalyticalProfile` para resumir os dados antes do `prompt`.

## 🚧 Gaps e Limitações Atuais
- **Persistência de Mapeamento**: Atualmente o mapeamento é feito a cada upload. Uma melhoria seria salvar o "perfil de mapeamento" por usuário.
- **Tamanho de Planilha**: Acima de 10.000 linhas, o tempo de batching pode aumentar significativamente (limite de timeout do serverless se aplicável).
- **Dados Temporais**: Suporte limitado a formatos de data fora do padrão DD/MM/YYYY.

## 🚀 Manutenção Futura
Para adicionar novos provedores de IA, basta atualizar o `backend/src/index.ts` no objeto `generateText`. Para novos campos de análise, atualize o `MappingModal.tsx` e a função `normalizeRow` no backend.
