use LouvorFlow;
go

if not exists (select 1 from dbo.Songs where Id = 'bondade-de-deus')
begin
  insert into dbo.Songs
  (
    Id,
    Title,
    Artist,
    OriginalKey,
    CurrentKey,
    Bpm,
    TimeSignature,
    IsFavorite,
    SectionsJson
  )
  values
  (
    'bondade-de-deus',
    'Bondade de Deus',
    'Bethel Music',
    'D',
    'D',
    63,
    '4/4',
    1,
    '[
      {
        "id": "intro",
        "code": "I",
        "name": "Introducao",
        "kind": "intro",
        "note": "Piano, suave",
        "lines": [
          { "lyric": "", "chords": [{ "value": "D", "position": 0 }, { "value": "G", "position": 2 }, { "value": "D", "position": 4 }, { "value": "G", "position": 6 }] }
        ]
      },
      {
        "id": "verso-1",
        "code": "V1",
        "name": "Verso 1",
        "kind": "verse",
        "lines": [
          { "lyric": "Te amo Deus Tua graca nunca falha", "chords": [{ "value": "D", "position": 0 }, { "value": "G", "position": 12 }, { "value": "D", "position": 29 }] },
          { "lyric": "Todos os dias eu estou", "chords": [{ "value": "A/C#", "position": 2 }, { "value": "Bm", "position": 11 }, { "value": "G", "position": 20 }] },
          { "lyric": "Eu cantarei da bondade de Deus", "chords": [{ "value": "G", "position": 8 }, { "value": "A", "position": 21 }, { "value": "D", "position": 29 }] }
        ]
      },
      {
        "id": "refrao-1",
        "code": "R1",
        "name": "Refrao",
        "kind": "chorus",
        "lines": [
          { "lyric": "Es fiel em todo tempo", "chords": [{ "value": "G", "position": 0 }, { "value": "D", "position": 17 }] },
          { "lyric": "Tu es tao tao bom", "chords": [{ "value": "D", "position": 7 }, { "value": "A", "position": 13 }] },
          { "lyric": "Eu cantarei da bondade de Deus", "chords": [{ "value": "G", "position": 8 }, { "value": "A", "position": 21 }, { "value": "D", "position": 29 }] }
        ]
      }
    ]'
  );
end
go

if not exists (select 1 from dbo.Repertoires where Id = 'domingo-noite')
begin
  insert into dbo.Repertoires (Id, Name, EventDate)
  values ('domingo-noite', 'Domingo a noite', '2026-07-12');

  insert into dbo.RepertoireSongs (RepertoireId, SongId, SongOrder, SongKey, Capo, Notes)
  values ('domingo-noite', 'bondade-de-deus', 1, 'D', 0, 'Versao principal');
end
go
