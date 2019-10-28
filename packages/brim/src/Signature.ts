export interface SignatureStreamParameter {
  readonly name: string;
}

export interface SignatureFunctionParameter {
  readonly name: string;
  readonly signature: FunctionSignature;
}

export interface FunctionSignature {
  readonly streamParameters: ReadonlyArray<SignatureStreamParameter>;
  readonly functionParameters: ReadonlyArray<SignatureFunctionParameter>;
  readonly yields: boolean;
}
