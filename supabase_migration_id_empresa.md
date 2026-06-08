# Migração: vincular dados ao `id_empresa` (separação por empresa)

## Por que preciso rodar isto?

Para garantir que os dados de uma empresa **nunca se misturem** com os de outra na mesma
conta de BI, passamos a gravar o `id_empresa` (a empresa dona dos dados no Simplo CRM) em
cada oportunidade e a vincular a conta de BI a essa empresa.

O backend já foi ajustado para gravar `id_empresa`. **Sem as colunas abaixo, a
sincronização vai falhar** ao tentar gravar. Rode este SQL antes de sincronizar.

## Como rodar

1. Supabase → seu projeto → **SQL Editor**.
2. Cole o bloco abaixo e clique em **Run**.
3. Confirme que rodou sem erro e me avise.

## SQL

```sql
-- Coluna que identifica a empresa dona de cada oportunidade (vindo do CRM)
alter table public.oportunidades
  add column if not exists id_empresa text;

-- Índice para consultas/filtros por empresa dentro de cada usuário
create index if not exists idx_oportunidades_user_empresa
  on public.oportunidades (user_id, id_empresa);

-- Empresa à qual esta conta de BI fica vinculada (trava 1 empresa por conta)
alter table public.crm_configs
  add column if not exists id_empresa text;
```

## Verificação (opcional)

```sql
select table_name, column_name
from   information_schema.columns
where  table_schema = 'public'
  and  table_name in ('oportunidades', 'crm_configs')
  and  column_name = 'id_empresa'
order  by table_name;
```

Esperado: duas linhas (`crm_configs` e `oportunidades`).

---

## Como a separação funciona depois disso

- Na 1ª sincronização, a conta de BI fica **vinculada** ao `id_empresa` retornado pelo token.
- Se você tentar sincronizar um token de **outra empresa**, o sistema **bloqueia** com uma
  mensagem clara, em vez de misturar os dados.
- Para **trocar** a conta de BI para outra empresa, primeiro apague os dados atuais na aba
  **Histórico** (isso remove as oportunidades e libera o vínculo na próxima sincronização).

> Observação: dados antigos importados por **CSV** ficam com `id_empresa` vazio (`null`) —
> normal, pois o CSV não traz esse campo. A trava se aplica apenas à sincronização via API.
