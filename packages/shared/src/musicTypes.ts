export type NoteName = "C" | "C#" | "Db" | "D" | "D#" | "Eb" | "E" | "F" | "F#" | "Gb" | "G" | "G#" | "Ab" | "A" | "A#" | "Bb" | "B";

export type SectionKind =
  | "intro"
  | "verse"
  | "preChorus"
  | "chorus"
  | "bridge"
  | "grandPause"
  | "instrumental"
  | "interlude"
  | "ramp"
  | "repeat"
  | "turnaround"
  | "ending";

export interface ChordPlacement {
  value: string;
  position: number;
}

export interface SongLine {
  lyric: string;
  chords: ChordPlacement[];
}

export interface SongSection {
  id: string;
  code: string;
  name: string;
  kind: SectionKind;
  note?: string;
  lines: SongLine[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  originalKey: NoteName;
  currentKey: NoteName;
  bpm: number;
  timeSignature: string;
  favorite?: boolean;
  rawChart?: string;
  sections: SongSection[];
}

export interface RepertoireSong {
  songId: string;
  order?: number;
  key: NoteName;
  capo: number;
  note?: string;
}

export interface Repertoire {
  id: string;
  name: string;
  date: string;
  eventTime?: string;
  description?: string;
  songs: RepertoireSong[];
}
