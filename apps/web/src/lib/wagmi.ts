import { createConfig, http, fallback } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhood, robinhoodTestnet } from "viem/chains";
import type { Chain } from "viem";

/**
 * Robinhood Chain definitions come from viem; we only reorder RPCs so the first URL a wallet
 * receives (wallet_addEthereumChain) is reachable from ISPs that block *.robinhood.com.
 * Override with NEXT_PUBLIC_RH_RPC_TESTNET / NEXT_PUBLIC_RH_RPC_MAINNET (e.g. an Alchemy URL).
 * NEXT_PUBLIC_* values ship to the browser — only use keys restricted by domain allow-list.
 */
const list = (env: string | undefined, rest: string[]) => [...(env ? [env] : []), ...rest];

const testnetRpc = list(process.env.NEXT_PUBLIC_RH_RPC_TESTNET, [
  "https://robinhood-sepolia-rpc.publicnode.com",
  "https://rpc.testnet.chain.robinhood.com",
]);
const mainnetRpc = list(process.env.NEXT_PUBLIC_RH_RPC_MAINNET, [
  "https://robinhood-rpc.publicnode.com",
  "https://robinhood.drpc.org",
  "https://rpc.mainnet.chain.robinhood.com",
]);

export const rhTestnet = { ...robinhoodTestnet, rpcUrls: { default: { http: testnetRpc } } } as const satisfies Chain;
export const rhMainnet = { ...robinhood, rpcUrls: { default: { http: mainnetRpc } } } as const satisfies Chain;

export const wagmiConfig = createConfig({
  chains: [rhTestnet, rhMainnet],
  // Browser wallets announce themselves via EIP-6963 (MetaMask, Rabby, Phantom, Coinbase, OKX…);
  // `injected()` is the legacy window.ethereum fallback.
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    [rhTestnet.id]: fallback(testnetRpc.map((u) => http(u))),
    [rhMainnet.id]: fallback(mainnetRpc.map((u) => http(u))),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
