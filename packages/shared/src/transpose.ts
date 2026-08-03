import { ChordPlacement, NoteName, Song, SongLine } from "./musicTypes";

var SHARP_NOTES: NoteName[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var FLAT_NOTES: NoteName[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

var NOTE_INDEX: { [note: string]: number } = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

var FLAT_KEYS: { [note: string]: boolean } = {
  F: true,
  Bb: true,
  Eb: true,
  Ab: true,
  Db: true,
  Gb: true
};

export function semitoneDistance(from: NoteName, to: NoteName): number {
  return normalizeIndex(NOTE_INDEX[to] - NOTE_INDEX[from]);
}

export function transposeSong(song: Song, targetKey: NoteName): Song {
  var diff = semitoneDistance(song.originalKey, targetKey);

  if (diff === 0) {
    return {
      ...song,
      currentKey: targetKey
    };
  }

  return {
    ...song,
    currentKey: targetKey,
    sections: song.sections.map(function (section) {
      return {
        ...section,
        lines: section.lines.map(function (line) {
          return transposeLine(line, diff, targetKey);
        })
      };
    })
  };
}

export function transposeLine(line: SongLine, diff: number, targetKey: NoteName): SongLine {
  return {
    lyric: line.lyric,
    chords: line.chords.map(function (chord) {
      return transposePlacement(chord, diff, targetKey);
    })
  };
}

export function transposePlacement(chord: ChordPlacement, diff: number, targetKey: NoteName): ChordPlacement {
  return {
    position: chord.position,
    value: transposeChord(chord.value, diff, targetKey)
  };
}

export function transposeChord(chord: string, diff: number, targetKey: NoteName): string {
  var slashParts = chord.split("/");
  var main = transposeChordPart(slashParts[0], diff, targetKey);

  if (slashParts.length === 1) {
    return main;
  }

  return main + "/" + transposeChordPart(slashParts[1], diff, targetKey);
}

function transposeChordPart(part: string, diff: number, targetKey: NoteName): string {
  var match = part.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) {
    return part;
  }

  var root = match[1];
  var suffix = match[2] || "";
  var index = normalizeIndex(NOTE_INDEX[root] + diff);
  var scale = FLAT_KEYS[targetKey] ? FLAT_NOTES : SHARP_NOTES;

  return scale[index] + suffix;
}

function normalizeIndex(index: number): number {
  while (index < 0) {
    index += 12;
  }

  return index % 12;
}
