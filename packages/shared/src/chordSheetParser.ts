import { SongSection } from "./musicTypes";

var SECTION_NAMES: { [name: string]: { code: string; kind: SongSection["kind"]; name: string } } = {
  intro: { code: "I", kind: "intro", name: "Intro" },
  introducao: { code: "I", kind: "intro", name: "Introdução" },
  verso: { code: "V", kind: "verse", name: "Verso" },
  "verso 1": { code: "V1", kind: "verse", name: "Verso 1" },
  "verso 2": { code: "V2", kind: "verse", name: "Verso 2" },
  "primeira parte": { code: "S1", kind: "verse", name: "Primeira Parte" },
  "segunda parte": { code: "S2", kind: "verse", name: "Segunda Parte" },
  pr: { code: "Pr", kind: "preChorus", name: "Pré-refrão" },
  "pre refrao": { code: "Pr", kind: "preChorus", name: "Pré-refrão" },
  "pre-refrao": { code: "Pr", kind: "preChorus", name: "Pré-refrão" },
  "pre-refrão": { code: "Pr", kind: "preChorus", name: "Pré-refrão" },
  refrao: { code: "R1", kind: "chorus", name: "Refrão" },
  ponte: { code: "P", kind: "bridge", name: "Ponte" },
  gp: { code: "Gp", kind: "grandPause", name: "Grande Pausa" },
  "grande pausa": { code: "Gp", kind: "grandPause", name: "Grande Pausa" },
  in: { code: "In", kind: "instrumental", name: "Instrumental" },
  instrumental: { code: "In", kind: "instrumental", name: "Instrumental" },
  interludio: { code: "It", kind: "interlude", name: "Interlúdio" },
  re: { code: "Re", kind: "repeat", name: "Repete" },
  repete: { code: "Re", kind: "repeat", name: "Repete" },
  to: { code: "To", kind: "turnaround", name: "Turnaround" },
  turnaround: { code: "To", kind: "turnaround", name: "Turnaround" },
  solo: { code: "S", kind: "interlude", name: "Solo" },
  final: { code: "F", kind: "ending", name: "Final" }
};

export function parseChordSheet(input: string): SongSection[] {
  var lines = input.replace(/\r/g, "").split("\n");
  var sections: SongSection[] = [];
  var current: SongSection | null = null;
  var pendingChords: { value: string; position: number }[] = [];

  function ensureCurrent(title: string) {
    if (!current) {
      current = createSection(title, sections.length);
      sections.push(current);
    }

    return current;
  }

  function flushPendingChords() {
    if (!pendingChords.length) {
      return;
    }

    ensureCurrent("Música").lines.push({
      lyric: "",
      chords: pendingChords
    });
    pendingChords = [];
  }

  lines.forEach(function (rawLine) {
    var line = rawLine.replace(/\t/g, "    ");
    var sectionLine = readSectionLine(line);

    if (sectionLine) {
      flushPendingChords();
      current = createSection(sectionLine.title, sections.length);
      sections.push(current);

      if (sectionLine.rest && isChordOnlyLine(sectionLine.rest)) {
        pendingChords = extractChords(sectionLine.rest, sectionLine.offset);
      }

      return;
    }

    if (!line.trim()) {
      flushPendingChords();
      if (current) {
        current.lines.push({ lyric: "", chords: [] });
      }
      return;
    }

    if (isChordOnlyLine(line)) {
      flushPendingChords();
      pendingChords = extractChords(line);
      return;
    }

    ensureCurrent("Música").lines.push({
      lyric: line.trimEnd(),
      chords: pendingChords
    });
    pendingChords = [];
  });

  flushPendingChords();

  return sections.filter(function (section) {
    return section.lines.some(function (line) {
      return Boolean(line.lyric || line.chords.length);
    });
  });
}

function createSection(title: string, index: number): SongSection {
  var normalized = normalizeTitle(title);
  var known = SECTION_NAMES[normalized] || { code: "S" + (index + 1), kind: "verse" as SongSection["kind"], name: title };

  return {
    id: slugify(title) + "-" + index,
    code: known.code,
    name: known.name,
    kind: known.kind,
    lines: []
  };
}

function readSectionLine(line: string): { title: string; rest: string; offset: number } | null {
  var bracketMatch = line.trim().match(/^\[(.+)\]$/);
  if (bracketMatch) {
    return { title: bracketMatch[1], rest: "", offset: 0 };
  }

  var inlineBracketMatch = line.match(/^(\s*)\[([^\]]+)\](.*)$/);
  if (inlineBracketMatch) {
    return {
      title: inlineBracketMatch[2],
      rest: inlineBracketMatch[3],
      offset: inlineBracketMatch[1].length + inlineBracketMatch[2].length + 2
    };
  }

  var clean = normalizeTitle(line);
  if (SECTION_NAMES[clean]) {
    return { title: line.trim(), rest: "", offset: 0 };
  }

  return null;
}

function isChordOnlyLine(line: string): boolean {
  var pieces = line.trim().split(/\s+/);
  if (!pieces.length) {
    return false;
  }

  var chordCount = 0;
  var valid = pieces.every(function (piece) {
    if (isChordBoundary(piece)) {
      return true;
    }

    if (readChordToken(piece)) {
      chordCount += 1;
      return true;
    }

    return false;
  });

  return valid && chordCount > 0;
}

function extractChords(line: string, offset?: number): { value: string; position: number }[] {
  var chords: { value: string; position: number }[] = [];
  var match: RegExpExecArray | null;
  var regex = /\S+/g;
  var baseOffset = offset || 0;

  while ((match = regex.exec(line))) {
    var chord = readChordToken(match[0]);
    if (chord) {
      chords.push({
        value: chord.value,
        position: match.index + chord.offset + baseOffset
      });
    }
  }

  return chords;
}

function isChordBoundary(value: string): boolean {
  return /^[()]+$/.test(value);
}

function readChordToken(value: string): { value: string; offset: number } | null {
  var chord = value;
  var offset = 0;
  var leadingParens = 0;

  while (chord.charAt(0) === "(") {
    chord = chord.slice(1);
    offset += 1;
    leadingParens += 1;
  }

  while (leadingParens > 0 && chord.charAt(chord.length - 1) === ")") {
    chord = chord.slice(0, -1);
    leadingParens -= 1;
  }

  if (leadingParens === 0 && chord.charAt(chord.length - 1) === ")" && chord.indexOf("(") < 0) {
    chord = chord.slice(0, -1);
  }

  return chord && isChord(chord) ? { value: chord, offset: offset } : null;
}

function isChord(value: string): boolean {
  var slashIndex = value.indexOf("/");
  var chord = value;

  if (slashIndex >= 0) {
    var bass = value.slice(slashIndex + 1);

    if (/^[A-G](?:#|b)?$/.test(bass)) {
      chord = value.slice(0, slashIndex);

      if (bass.indexOf("/") >= 0) {
        return false;
      }
    }
  }

  var match = chord.match(/^[A-G](?:#|b)?(.*)$/);
  if (!match) {
    return false;
  }

  return isChordBody(match[1]);
}

function isChordBody(value: string): boolean {
  var remaining = value;

  while (remaining.length > 0) {
    var next = consumeChordBodyPart(remaining);

    if (next === remaining) {
      return false;
    }

    remaining = next;
  }

  return true;
}

function consumeChordBodyPart(value: string): string {
  var parenthesized = value.match(/^\(([^()\s]+)\)/);
  if (parenthesized && isChordBody(parenthesized[1])) {
    return value.slice(parenthesized[0].length);
  }

  var numeric = value.match(/^\d+/);
  if (numeric) {
    return value.slice(numeric[0].length);
  }

  var alteration = value.match(/^(?:#|b|\+|-)\d+/);
  if (alteration) {
    return value.slice(alteration[0].length);
  }

  var slashExtension = value.match(/^\/\d+/);
  if (slashExtension) {
    return value.slice(slashExtension[0].length);
  }

  var noTone = value.match(/^no\d+/i);
  if (noTone) {
    return value.slice(noTone[0].length);
  }

  var symbols = ["maj", "Maj", "min", "sus", "add", "dim", "aug", "aum", "Ma", "M", "m", "\u00F8", "\u00B0", "\u00BA", "+", "-"];

  for (var index = 0; index < symbols.length; index += 1) {
    var symbol = symbols[index];

    if (value.indexOf(symbol) === 0) {
      return value.slice(symbol.length);
    }
  }

  return value;
}

function normalizeTitle(value: string): string {
  var text = value.toLowerCase();
  var normalized = typeof text.normalize === "function" ? text.normalize("NFD") : text;

  return normalized
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\[\]]/g, "")
    .trim();
}

function slugify(value: string): string {
  return normalizeTitle(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "secao";
}
