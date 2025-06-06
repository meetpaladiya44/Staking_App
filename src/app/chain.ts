// import { defineChain } from "thirdweb";

export const chain = defineChain({
  id: 480,
  name: "World Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [`https://worldchain-mainnet.g.alchemy.com/public`],
    },
    public: {
      http: ["https://worldchain-mainnet.g.alchemy.com/public"],
    },
  },
  blockExplorers: {
    default: {
      name: "WorldScan",
      url: "https://worldscan.org",
    },
  },
});