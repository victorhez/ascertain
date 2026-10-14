/** Real HyperEVM mainnet tokens in the replay set. Launch blocks and pool addresses were supplied by the team and are checked against the explorer. */
export interface RealToken {
  symbol: string;
  name: string;
  address: `0x${string}`;
  pool: `0x${string}`;
  launchBlock: number;
  note: string;
}

export const REAL_TOKENS: RealToken[] = [
  { symbol: "PURR", name: "Purr", address: "0x9b498c3c8a0b8cd8ba1d9851d40d186f1872b44e", pool: "0x466F0cD324dCC4ad31053a0bc2013EaE7e474420", launchBlock: 14_643_154, note: "Established HyperEVM token (expected clean-ish)" },
  { symbol: "HWAVE", name: "Hyperwave", address: "0x0e01e3afd147c7f079ea19d0eca166ad3a22e79d", pool: "0x2CF9731B75cdF79Ea9ff21F17c318C12F9C79Fd6", launchBlock: 21_105_931, note: "Mid-size HyperEVM token" },
  { symbol: "HPL", name: "HyperLend", address: "0xbd6dab50f03a305a80037294fa8d1a9dc0cac91b", pool: "0x30634903EeD4c3f624B73E3A2F793eBbBc710aA7", launchBlock: 37_857_073, note: "Newer protocol token" },
];
