const gen32 = (): string => Math.random().toString(16).substring(2, 10);

const genuid = (): string => gen32() + gen32();

export default genuid;
