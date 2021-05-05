export function charIsPrintable(c: string): boolean {
  // hacky, but works. see https://stackoverflow.com/questions/12467240/determine-if-javascript-e-keycode-is-a-printable-non-control-character#comment114613852_58658881
  return [...c].length === 1;
}
