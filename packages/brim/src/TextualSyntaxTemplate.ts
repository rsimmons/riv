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

export type TemplateSegment = Wildcard | LineBreak | Text;

export type TextualSyntaxTemplate = ReadonlyArray<TemplateSegment>;

export function parseTemplateString(s: string): TextualSyntaxTemplate {
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

export function templateToPlainText(template: TextualSyntaxTemplate): string {
  const resultPieces: Array<string> = [];

  for (const piece of template) {
    if (piece.kind === 'text') {
      resultPieces.push(piece.text);
    }
  }

  return resultPieces.join(' ');
}
