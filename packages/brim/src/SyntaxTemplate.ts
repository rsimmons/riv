interface Wildcard {
  kind: 'wildcard';
  key: string;
}

interface LineBreak {
  kind: 'linebreak';
}

interface Text {
  kind: 'text';
  text: string;
}

type TemplateSegment = Wildcard | LineBreak | Text;

type Template = ReadonlyArray<TemplateSegment>;

export function parseTemplateString(s: string): Template {
  const splits = s.split(/(\$[a-z0-9]+|\|)/).map(s => s.trim()).filter(s => s);
  const result: Array<TemplateSegment> = [];

  for (const split of splits) {
    if (split.startsWith('$')) {
      result.push({
        kind: 'wildcard',
        key: split.substr(1),
      });
    } else if (split.startsWith('|')) {
      result.push({
        kind: 'linebreak',
      });
    } else {
      result.push({
        kind: 'text',
        text: split,
      });
    }
  }

  return result;
}

export function templateToPlainText(template: Template): string {
  const resultPieces: Array<string> = [];

  for (const piece of template) {
    if (piece.kind === 'text') {
      resultPieces.push(piece.text);
    }
  }

  return resultPieces.join(' ');
}
