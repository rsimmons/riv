import { templateToPlainText, parseTemplateString } from './SyntaxTemplate';

interface NoFunctionUI {
  kind: 'none';
}

interface TemplateStringFunctionUI {
  kind: 'tmplstr';
  tmplStr: string;
}

export type FunctionUI = NoFunctionUI | TemplateStringFunctionUI;

export function functionUIAsPlainText(ui: FunctionUI): string {
  switch (ui.kind) {
    case 'none':
      return '<no ui>';

    case 'tmplstr':
      return templateToPlainText(parseTemplateString(ui.tmplStr));

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = ui; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}
