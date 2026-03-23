import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
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
    hardhhat: {
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
});
