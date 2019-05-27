const gen32 = (): string => Math.random().toString(16).substring(2, 10);

export default (): string => gen32() + gen32();
