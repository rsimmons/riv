export interface GroupEditable {
  insertBefore: boolean;
  insertAfter: boolean;
  delete: boolean;
}

export interface TextSegment {
  kind: 'text';
  text: string;
}

export interface PlaceholderSegment {
  kind: 'placeholder';
  key: string;
}

export type TemplateSegment = TextSegment | PlaceholderSegment;

export interface TemplateGroup {
  segments: ReadonlyArray<TemplateSegment>;
  editable?: GroupEditable;
}

export type TemplateLayout = ReadonlyArray<TemplateGroup>;

export function templateToPlainText(template: TemplateLayout): string {
  const resultPieces: Array<string> = [];

  for (const group of template) {
    for (const segment of group.segments) {
      if (segment.kind === 'text') {
        resultPieces.push(segment.text);
      }
    }
  }

  return resultPieces.join(' ');
}
