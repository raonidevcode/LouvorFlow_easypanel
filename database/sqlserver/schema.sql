if db_id('LouvorFlow') is null
begin
  create database LouvorFlow;
end
go

use LouvorFlow;
go

if object_id('dbo.Users', 'U') is null
begin
  create table dbo.Users
  (
    Id nvarchar(80) not null primary key,
    Email nvarchar(320) not null,
    DisplayName nvarchar(200) not null,
    PasswordHash nvarchar(500) null,
    IsAppMaster bit not null constraint DF_Users_IsAppMaster default 0,
    CreatedAt datetime2 not null constraint DF_Users_CreatedAt default sysdatetime(),
    UpdatedAt datetime2 not null constraint DF_Users_UpdatedAt default sysdatetime()
  );
end
go

if object_id('dbo.Users', 'U') is not null and col_length('dbo.Users', 'IsAppMaster') is null
begin
  alter table dbo.Users add IsAppMaster bit not null constraint DF_Users_IsAppMaster default 0 with values;
end
go

if object_id('dbo.Users', 'U') is not null and col_length('dbo.Users', 'IsActive') is null
begin
  alter table dbo.Users add IsActive bit not null constraint DF_Users_IsActive default 1 with values;
end
go

if object_id('dbo.Workspaces', 'U') is null
begin
  create table dbo.Workspaces
  (
    Id nvarchar(80) not null primary key,
    Name nvarchar(200) not null,
    CreatedAt datetime2 not null constraint DF_Workspaces_CreatedAt default sysdatetime(),
    UpdatedAt datetime2 not null constraint DF_Workspaces_UpdatedAt default sysdatetime()
  );
end
go

if object_id('dbo.WorkspaceUsers', 'U') is null
begin
  create table dbo.WorkspaceUsers
  (
    Id int identity(1,1) not null primary key,
    WorkspaceId nvarchar(80) not null,
    UserId nvarchar(80) not null,
    Role nvarchar(40) not null constraint DF_WorkspaceUsers_Role default 'member',
    CreatedAt datetime2 not null constraint DF_WorkspaceUsers_CreatedAt default sysdatetime(),
    constraint FK_WorkspaceUsers_Workspaces foreign key (WorkspaceId) references dbo.Workspaces(Id),
    constraint FK_WorkspaceUsers_Users foreign key (UserId) references dbo.Users(Id)
  );
end
go

if not exists (select 1 from dbo.Workspaces where Id = 'default')
begin
  insert into dbo.Workspaces (Id, Name) values ('default', 'App Música');
end
go

if not exists (select 1 from dbo.Users where Id = 'default-user')
begin
  insert into dbo.Users (Id, Email, DisplayName, PasswordHash, IsAppMaster)
  values ('default-user', 'raonisoaresg3@gmail.com', 'Raoni Soares', 'pbkdf2$sha256$120000$jj8sA_hKFa5TzInBPq05Sw$KyhMHKIih6JbYuxsUqq0c-n4udv5L-X6wPIpXvzQUjs', 1);
end
go

if exists (select 1 from dbo.Users where Id = 'default-user')
begin
  update dbo.Users
  set Email = 'raonisoaresg3@gmail.com',
      DisplayName = 'Raoni Soares',
      PasswordHash = 'pbkdf2$sha256$120000$jj8sA_hKFa5TzInBPq05Sw$KyhMHKIih6JbYuxsUqq0c-n4udv5L-X6wPIpXvzQUjs',
      IsAppMaster = 1,
      IsActive = 1,
      UpdatedAt = sysdatetime()
  where Id = 'default-user';
end
go

if not exists (select 1 from dbo.WorkspaceUsers where WorkspaceId = 'default' and UserId = 'default-user')
begin
  insert into dbo.WorkspaceUsers (WorkspaceId, UserId, Role) values ('default', 'default-user', 'master');
end
go

if object_id('dbo.WorkspaceUsers', 'U') is not null
begin
  update dbo.WorkspaceUsers
  set Role = 'master'
  where Role in ('owner', 'admin');

  update dbo.WorkspaceUsers
  set Role = 'master'
  where WorkspaceId = 'default' and UserId = 'default-user';
end
go

if object_id('dbo.DF_WorkspaceUsers_Role', 'D') is not null
begin
  alter table dbo.WorkspaceUsers drop constraint DF_WorkspaceUsers_Role;
end
go

if object_id('dbo.WorkspaceUsers', 'U') is not null and object_id('dbo.DF_WorkspaceUsers_Role', 'D') is null
begin
  alter table dbo.WorkspaceUsers add constraint DF_WorkspaceUsers_Role default 'member' for Role;
end
go

if object_id('dbo.WorkspaceUsers', 'U') is not null
  and not exists (select 1 from sys.check_constraints where name = 'CK_WorkspaceUsers_Role' and parent_object_id = object_id('dbo.WorkspaceUsers'))
begin
  alter table dbo.WorkspaceUsers add constraint CK_WorkspaceUsers_Role check (Role in ('master', 'member', 'viewer'));
end
go

if object_id('dbo.Songs', 'U') is null
begin
  create table dbo.Songs
  (
    Id nvarchar(80) not null primary key,
    WorkspaceId nvarchar(80) not null constraint DF_Songs_WorkspaceId default 'default',
    Title nvarchar(200) not null,
    Artist nvarchar(200) not null,
    OriginalKey nvarchar(8) not null,
    CurrentKey nvarchar(8) not null,
    Bpm int not null,
    TimeSignature nvarchar(12) not null,
    IsFavorite bit not null constraint DF_Songs_IsFavorite default 0,
    SectionsJson nvarchar(max) not null,
    RawChart nvarchar(max) null,
    CreatedAt datetime2 not null constraint DF_Songs_CreatedAt default sysdatetime(),
    UpdatedAt datetime2 not null constraint DF_Songs_UpdatedAt default sysdatetime(),
    constraint FK_Songs_Workspaces foreign key (WorkspaceId) references dbo.Workspaces(Id)
  );
end
go

if object_id('dbo.Songs', 'U') is not null and col_length('dbo.Songs', 'WorkspaceId') is null
begin
  alter table dbo.Songs add WorkspaceId nvarchar(80) not null constraint DF_Songs_WorkspaceId default 'default' with values;
end
go

if object_id('dbo.Songs', 'U') is not null and col_length('dbo.Songs', 'RawChart') is null
begin
  alter table dbo.Songs add RawChart nvarchar(max) null;
end
go

if object_id('dbo.Songs', 'U') is not null and not exists (select 1 from sys.foreign_keys where name = 'FK_Songs_Workspaces')
begin
  alter table dbo.Songs add constraint FK_Songs_Workspaces foreign key (WorkspaceId) references dbo.Workspaces(Id);
end
go

if object_id('dbo.Repertoires', 'U') is null
begin
  create table dbo.Repertoires
  (
    Id nvarchar(80) not null primary key,
    WorkspaceId nvarchar(80) not null constraint DF_Repertoires_WorkspaceId default 'default',
    Name nvarchar(200) not null,
    EventDate date not null,
    EventTime time(0) null,
    Description nvarchar(1000) null,
    CreatedAt datetime2 not null constraint DF_Repertoires_CreatedAt default sysdatetime(),
    UpdatedAt datetime2 not null constraint DF_Repertoires_UpdatedAt default sysdatetime(),
    constraint FK_Repertoires_Workspaces foreign key (WorkspaceId) references dbo.Workspaces(Id)
  );
end
go

if object_id('dbo.Repertoires', 'U') is not null and col_length('dbo.Repertoires', 'WorkspaceId') is null
begin
  alter table dbo.Repertoires add WorkspaceId nvarchar(80) not null constraint DF_Repertoires_WorkspaceId default 'default' with values;
end
go

if object_id('dbo.Repertoires', 'U') is not null and col_length('dbo.Repertoires', 'EventTime') is null
begin
  alter table dbo.Repertoires add EventTime time(0) null;
end
go

if object_id('dbo.Repertoires', 'U') is not null and col_length('dbo.Repertoires', 'Description') is null
begin
  alter table dbo.Repertoires add Description nvarchar(1000) null;
end
go

if object_id('dbo.Repertoires', 'U') is not null and not exists (select 1 from sys.foreign_keys where name = 'FK_Repertoires_Workspaces')
begin
  alter table dbo.Repertoires add constraint FK_Repertoires_Workspaces foreign key (WorkspaceId) references dbo.Workspaces(Id);
end
go

if object_id('dbo.RepertoireSongs', 'U') is null
begin
  create table dbo.RepertoireSongs
  (
    Id int identity(1,1) not null primary key,
    RepertoireId nvarchar(80) not null,
    SongId nvarchar(80) not null,
    SongOrder int not null,
    SongKey nvarchar(8) not null,
    Capo int not null constraint DF_RepertoireSongs_Capo default 0,
    Notes nvarchar(600) null,
    constraint FK_RepertoireSongs_Repertoires foreign key (RepertoireId) references dbo.Repertoires(Id),
    constraint FK_RepertoireSongs_Songs foreign key (SongId) references dbo.Songs(Id)
  );
end
go

if not exists (select 1 from sys.indexes where name = 'IX_Songs_Title' and object_id = object_id('dbo.Songs'))
  create index IX_Songs_Title on dbo.Songs(Title);

if not exists (select 1 from sys.indexes where name = 'IX_Songs_Workspace_Title' and object_id = object_id('dbo.Songs'))
  create index IX_Songs_Workspace_Title on dbo.Songs(WorkspaceId, Title);

if not exists (select 1 from sys.indexes where name = 'IX_Songs_Artist' and object_id = object_id('dbo.Songs'))
  create index IX_Songs_Artist on dbo.Songs(Artist);

if not exists (select 1 from sys.indexes where name = 'IX_RepertoireSongs_Repertoire' and object_id = object_id('dbo.RepertoireSongs'))
  create index IX_RepertoireSongs_Repertoire on dbo.RepertoireSongs(RepertoireId, SongOrder);

if not exists (select 1 from sys.indexes where name = 'IX_Repertoires_EventDate' and object_id = object_id('dbo.Repertoires'))
  create index IX_Repertoires_EventDate on dbo.Repertoires(EventDate);

if not exists (select 1 from sys.indexes where name = 'IX_Repertoires_Workspace_EventDate' and object_id = object_id('dbo.Repertoires'))
  create index IX_Repertoires_Workspace_EventDate on dbo.Repertoires(WorkspaceId, EventDate);

if not exists (select 1 from sys.indexes where name = 'UX_Users_Email' and object_id = object_id('dbo.Users'))
  create unique index UX_Users_Email on dbo.Users(Email);

if not exists (select 1 from sys.indexes where name = 'UX_WorkspaceUsers_Workspace_User' and object_id = object_id('dbo.WorkspaceUsers'))
  create unique index UX_WorkspaceUsers_Workspace_User on dbo.WorkspaceUsers(WorkspaceId, UserId);
go
