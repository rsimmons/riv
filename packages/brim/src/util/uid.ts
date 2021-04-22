function gen32Random(): string {
  return Math.random().toString(16).substring(2, 10);
}

function genuidRandom(): string {
  return gen32Random() + gen32Random();
}

let seqnum = 0;
function genuidSeq(): string {
  const s = 'uid' + seqnum.toString(16);
  seqnum++;
  return s;
}

export default genuidSeq;
