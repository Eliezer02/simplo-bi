# Setup da tabela `crm_configs` no Supabase

## Por que preciso rodar isto?

Durante a validação descobrimos que a tabela **`public.crm_configs` não existe** no seu
projeto Supabase (a API retorna `PGRST205 - Could not find the table`). O backend tenta
criá-la automaticamente via RPC `exec_sql`, mas essa RPC não existe no projeto — então a
tabela nunca foi criada.

Sem essa tabela, **salvar a chave de API do CRM e sincronizar falham**. Rode o SQL abaixo
para criar a tabela já com Row Level Security (RLS) ativo.

## Como rodar

1. Acesse o painel do Supabase → seu projeto → **SQL Editor**.
2. Cole o bloco abaixo e clique em **Run**.
3. Confirme que rodou sem erro e me avise.

## SQL (criar tabela + RLS + política)

```sql
-- 1. Tabela de configuração da integração CRM (1 registro por usuário do BI)
create table if not exists public.crm_configs (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  base_url        text not null,
  api_token       text not null,
  mapping_profile jsonb not null,
  last_sync       timestamptz,
  sync_status     text,
  error_message   text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 2. Ativa Row Level Security
alter table public.crm_configs enable row level security;

-- 3. Política: cada usuário só enxerga/edita a própria configuração
drop policy if exists "owner full access" on public.crm_configs;
create policy "owner full access" on public.crm_configs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## Verificação (opcional)

Depois de rodar, confirme que a tabela existe e que o RLS está ligado:

```sql
select relname            as tabela,
       relrowsecurity     as rls_ativo
from   pg_class
where  relname = 'crm_configs';
```

O esperado é `rls_ativo = true`.

---

> Observação: o backend acessa essa tabela usando a **service key** (que ignora o RLS por
> design), mas sempre filtrando por `user_id`. O RLS aqui é a segunda camada de proteção,
> para o caso de algum acesso via chave `anon` (pública).
