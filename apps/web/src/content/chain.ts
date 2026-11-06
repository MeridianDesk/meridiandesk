/**
 * Robinhood Chain networks + Blockscout explorers.
 * Explorer URLs from chainid.network (EIP-3091 entries) — verified 2026-11-06.
 * Active network is chosen by NEXT_PUBLIC_CHAIN_ID (default: testnet until guarded mainnet).
 */
export type ChainId = 4663 | 46630;

export const chains: Record<ChainId, { name: string; short: string; explorer: string }> = {
  46630: { name: "Robinhood Chain Testnet", short: "Testnet", explorer: "https://explorer.testnet.chain.robinhood.com" },
  4663: { name: "Robinhood Chain", short: "Mainnet", explorer: "https://robinhoodchain.blockscout.com" },
};

const envId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
export const ACTIVE_CHAIN_ID: ChainId = envId === 4663 ? 4663 : 46630;

export const isTxHash = (h: string): h is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(h);
export const txUrl = (hash: string, chainId: ChainId = ACTIVE_CHAIN_ID) => `${chains[chainId].explorer}/tx/${hash}`;
export const addressUrl = (addr: string, chainId: ChainId = ACTIVE_CHAIN_ID) => `${chains[chainId].explorer}/address/${addr}`;
export const shortHex = (h: string, head = 6, tail = 4) => `${h.slice(0, head)}…${h.slice(-tail)}`;
