import { parseToJustText } from './FormatStringFunctionUI';

interface NoFunctionUI {
  kind: 'none';
}

interface FormatStringFunctionUI {
  kind: 'fmtstring';
  format: string;
}

export type FunctionUI = NoFunctionUI | FormatStringFunctionUI;

export function asPlainText(ui: FunctionUI): string {
  switch (ui.kind) {
    case 'none':
      return '<no ui>';

    case 'fmtstring':
      return parseToJustText(ui.format);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = ui; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}
