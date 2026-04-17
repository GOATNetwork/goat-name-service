import "dotenv/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { configVariable, defineConfig } from "hardhat/config";

import { gnsPriceBookTasks } from "./tasks/gns-price-book.ts";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, hardhatVerify],
  tasks: [...gnsPriceBookTasks],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
          evmVersion: "cancun",
          metadata: {
            bytecodeHash: "none",
            useLiteralContent: true,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
          evmVersion: "cancun",
          metadata: {
            bytecodeHash: "none",
            useLiteralContent: true,
          },
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    testnet3: {
      type: "http",
      url: "https://rpc.testnet3.goat.network",
      chainType: "generic",
      accounts: [configVariable("GOAT_TESTNET3_DEPLOY_PRIVATE_KEY")],
    },
    mainnet: {
      type: "http",
      url: "https://rpc.goat.network",
      chainType: "generic",
      accounts: [configVariable("GOAT_MAINNET_DEPLOY_PRIVATE_KEY")],
    },
  },
  chainDescriptors: {
    2345: {
      name: "Goat Network Mainnet",
      chainType: "generic",
      blockExplorers: {
        blockscout: {
          name: "default",
          apiUrl: "https://explorer.goat.network/api",
          url: "https://explorer.goat.network",
        },
      },
    },
    48816: {
      name: "Goat Network Testnet3",
      chainType: "generic",
      blockExplorers: {
        blockscout: {
          name: "default",
          apiUrl: "https://explorer.testnet3.goat.network/api",
          url: "https://explorer.testnet3.goat.network",
        },
      },
    },
  },
  verify: {
    blockscout: {
      enabled: true,
    },
    etherscan: {
      enabled: false,
    },
    sourcify: {
      enabled: false,
    },
  },
});
