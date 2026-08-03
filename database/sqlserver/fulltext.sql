/*
  LouvorFlow - Full-Text Search

  Rode este script depois do schema.sql em cada banco novo, inclusive producao.
  Ele habilita a busca por texto em Title, Artist e RawChart da tabela Songs.
*/

if fulltextserviceproperty('IsFullTextInstalled') <> 1
begin
  throw 51000, 'O Full-Text Search nao esta instalado neste SQL Server.', 1;
end
go

if databasepropertyex(db_name(), 'IsFulltextEnabled') <> 1
begin
  exec sp_fulltext_database 'enable';
end
go

if not exists (select 1 from sys.fulltext_catalogs where name = 'LouvorFlowFullText')
begin
  create fulltext catalog LouvorFlowFullText
    with accent_sensitivity = off
    as default;
end
go

if exists (select 1 from sys.fulltext_catalogs where name = 'LouvorFlowFullText' and is_accent_sensitivity_on = 1)
begin
  alter fulltext catalog LouvorFlowFullText rebuild with accent_sensitivity = off;
end
go

declare @keyIndexName sysname;

select @keyIndexName = i.name
from sys.indexes i
inner join sys.key_constraints kc
  on kc.parent_object_id = i.object_id
  and kc.unique_index_id = i.index_id
where i.object_id = object_id('dbo.Songs')
  and kc.type = 'PK';

if @keyIndexName is null
begin
  throw 51001, 'Nao foi encontrada uma chave primaria para dbo.Songs.', 1;
end;

if not exists (select 1 from sys.fulltext_indexes where object_id = object_id('dbo.Songs'))
begin
  declare @sql nvarchar(max);

  set @sql = N'
    create fulltext index on dbo.Songs
    (
      Title language 1046,
      Artist language 1046,
      RawChart language 1046
    )
    key index ' + quotename(@keyIndexName) + N'
    on LouvorFlowFullText
    with change_tracking auto;';

  exec sp_executesql @sql;
end
go

select
  fulltextserviceproperty('IsFullTextInstalled') as IsFullTextInstalled,
  databasepropertyex(db_name(), 'IsFulltextEnabled') as IsFulltextEnabled;

select
  object_name(object_id) as TableName,
  is_enabled,
  change_tracking_state_desc
from sys.fulltext_indexes
where object_id = object_id('dbo.Songs');
go
