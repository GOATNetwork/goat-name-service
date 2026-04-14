import path from "node:path";

import { listDeployments, status } from "@nomicfoundation/ignition-core";
import { emptyTask, task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import {
  formatUnits,
  getAddress,
  getContract,
  parseUnits,
  type Address,
} from "viem";

const GNS_PRICE_BOOK_DEPLOYMENT_KEY = "GNSModule#GNSPriceBook";

const erc20MetadataAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

const gnsPriceBookAbi = [
  {
    type: "function",
    name: "setTokenConfig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "price3", type: "uint256" },
      { name: "price4", type: "uint256" },
      { name: "price5Plus", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "disableToken",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "tokenConfig",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "enabled", type: "bool" },
          { name: "price3", type: "uint256" },
          { name: "price4", type: "uint256" },
          { name: "price5Plus", type: "uint256" },
        ],
      },
    ],
  },
] as const;

type NetworkConnection = Awaited<
  ReturnType<HardhatRuntimeEnvironment["network"]["connect"]>
>;
type WalletClientWithAccount = Awaited<
  ReturnType<NetworkConnection["viem"]["getWalletClients"]>
>[number] & {
  account: NonNullable<
    Awaited<
      ReturnType<NetworkConnection["viem"]["getWalletClients"]>
    >[number]["account"]
  >;
};

type PriceBookConnection = {
  networkName: string;
  chainId: number;
  publicClient: Awaited<
    ReturnType<NetworkConnection["viem"]["getPublicClient"]>
  >;
  walletClient: WalletClientWithAccount;
};

type TokenMetadata = {
  address: Address;
  decimals: number;
  symbol?: string;
};

async function connectTask(
  hre: HardhatRuntimeEnvironment,
): Promise<PriceBookConnection> {
  const { networkName, viem } = await hre.network.connect();
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();

  if (walletClient === undefined) {
    throw new Error(
      `No wallet client is configured for network "${networkName}". Check hardhat.config.ts.`,
    );
  }

  if (walletClient.account === undefined) {
    throw new Error(
      `Wallet client for network "${networkName}" does not expose a default account.`,
    );
  }

  return {
    networkName,
    chainId: await publicClient.getChainId(),
    publicClient,
    walletClient,
  };
}

async function resolvePriceBookAddress(
  hre: HardhatRuntimeEnvironment,
  chainId: number,
): Promise<Address> {
  const deploymentId = `chain-${chainId}`;
  const deploymentsDir = path.join(hre.config.paths.ignition, "deployments");
  const deploymentIds = await listDeployments(deploymentsDir);

  if (deploymentIds.length === 0) {
    throw new Error(
      `No Ignition deployments found in ${deploymentsDir}. Run an Ignition deployment first.`,
    );
  }

  if (!deploymentIds.includes(deploymentId)) {
    throw new Error(
      `Cannot find Ignition deployment "${deploymentId}" in ${deploymentsDir}. Available deployments: ${deploymentIds.join(", ")}.`,
    );
  }

  const deploymentDir = path.join(deploymentsDir, deploymentId);

  let deploymentStatus: Awaited<ReturnType<typeof status>>;

  try {
    deploymentStatus = await status(deploymentDir);
  } catch (error) {
    throw new Error(
      `Cannot read Ignition deployment status for "${deploymentId}" at ${deploymentDir}.`,
      { cause: error },
    );
  }

  const priceBook = deploymentStatus.contracts[GNS_PRICE_BOOK_DEPLOYMENT_KEY];
  if (priceBook?.address === undefined) {
    throw new Error(
      `Missing ${GNS_PRICE_BOOK_DEPLOYMENT_KEY} in Ignition deployment "${deploymentId}".`,
    );
  }

  return getAddress(priceBook.address);
}

async function getTokenMetadata(
  publicClient: PriceBookConnection["publicClient"],
  tokenAddress: Address,
): Promise<TokenMetadata> {
  const token = getContract({
    address: tokenAddress,
    abi: erc20MetadataAbi,
    client: publicClient,
  });

  const decimals = Number(await token.read.decimals());
  let symbol: string | undefined;

  try {
    symbol = await token.read.symbol();
  } catch {
    symbol = undefined;
  }

  return {
    address: tokenAddress,
    decimals,
    symbol,
  };
}

function getPriceBookContract(
  connection: PriceBookConnection,
  priceBookAddress: Address,
) {
  return getContract({
    address: priceBookAddress,
    abi: gnsPriceBookAbi,
    client: {
      public: connection.publicClient,
      wallet: connection.walletClient,
    },
  });
}

function requireAddressOption(
  name: string,
  value: string | undefined,
): Address {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required option --${toCliOption(name)}.`);
  }

  return getAddress(value);
}

function requirePriceOption(
  name: string,
  value: string | undefined,
  decimals: number,
): {
  units: bigint;
  formatted: string;
} {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required option --${toCliOption(name)}.`);
  }

  const units = parseUnits(value, decimals);

  return {
    units,
    formatted: formatUnits(units, decimals),
  };
}

function logTaskContext(context: {
  action: string;
  networkName: string;
  chainId: number;
  sender: Address;
  priceBookAddress: Address;
  token: TokenMetadata;
}) {
  console.log(`Action: ${context.action}`);
  console.log(`Network: ${context.networkName} (chainId ${context.chainId})`);
  console.log(`Sender: ${context.sender}`);
  console.log(`GNSPriceBook: ${context.priceBookAddress}`);
  console.log(
    `Token: ${context.token.address}${context.token.symbol !== undefined ? ` (${context.token.symbol})` : ""}`,
  );
  console.log(`Token decimals: ${context.token.decimals}`);
}

function getTransactionExplorerUrl(
  hre: HardhatRuntimeEnvironment,
  chainId: number,
  hash: `0x${string}`,
): string | undefined {
  const chainDescriptor = hre.config.chainDescriptors.get(BigInt(chainId));
  const explorerBaseUrl =
    chainDescriptor?.blockExplorers.blockscout?.url ??
    chainDescriptor?.blockExplorers.etherscan?.url;

  if (explorerBaseUrl === undefined) {
    return undefined;
  }

  return new URL(`tx/${hash}`, ensureTrailingSlash(explorerBaseUrl)).toString();
}

function logSubmittedTransaction(
  hre: HardhatRuntimeEnvironment,
  chainId: number,
  hash: `0x${string}`,
) {
  const explorerUrl = getTransactionExplorerUrl(hre, chainId, hash);

  console.log(`Submitted transaction: ${hash}`);
  if (explorerUrl !== undefined) {
    console.log(`Explorer: ${explorerUrl}`);
  }
}

function toCliOption(name: string): string {
  return name
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replace(/([0-9])([a-zA-Z])/g, "$1-$2")
    .toLowerCase();
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export const gnsPriceBookTasks = [
  emptyTask(
    "gns-price-book",
    "Manage the deployed GNSPriceBook contract",
  ).build(),
  task(
    ["gns-price-book", "set-token-config"],
    "Call GNSPriceBook.setTokenConfig using the Ignition deployment for the selected network",
  )
    .addOption({
      name: "token",
      description: "ERC20 payment token address",
      type: ArgumentType.STRING_WITHOUT_DEFAULT,
      defaultValue: undefined,
    })
    .addOption({
      name: "price3",
      description: "Annual price for 3-byte labels, in whole token units",
      type: ArgumentType.STRING_WITHOUT_DEFAULT,
      defaultValue: undefined,
    })
    .addOption({
      name: "price4",
      description: "Annual price for 4-byte labels, in whole token units",
      type: ArgumentType.STRING_WITHOUT_DEFAULT,
      defaultValue: undefined,
    })
    .addOption({
      name: "price5Plus",
      description: "Annual price for 5+ byte labels, in whole token units",
      type: ArgumentType.STRING_WITHOUT_DEFAULT,
      defaultValue: undefined,
    })
    .setInlineAction(async (taskArguments, hre) => {
      const connection = await connectTask(hre);
      const priceBookAddress = await resolvePriceBookAddress(
        hre,
        connection.chainId,
      );
      const tokenAddress = requireAddressOption("token", taskArguments.token);
      const token = await getTokenMetadata(
        connection.publicClient,
        tokenAddress,
      );
      const price3 = requirePriceOption(
        "price3",
        taskArguments.price3,
        token.decimals,
      );
      const price4 = requirePriceOption(
        "price4",
        taskArguments.price4,
        token.decimals,
      );
      const price5Plus = requirePriceOption(
        "price5Plus",
        taskArguments.price5Plus,
        token.decimals,
      );
      const priceBook = getPriceBookContract(connection, priceBookAddress);

      logTaskContext({
        action: "setTokenConfig",
        networkName: connection.networkName,
        chainId: connection.chainId,
        sender: connection.walletClient.account.address,
        priceBookAddress,
        token,
      });
      console.log(
        `Annual prices: 3=${price3.formatted} (${price3.units}), 4=${price4.formatted} (${price4.units}), 5+=${price5Plus.formatted} (${price5Plus.units})`,
      );

      const hash = await priceBook.write.setTokenConfig([
        token.address,
        price3.units,
        price4.units,
        price5Plus.units,
      ]);

      logSubmittedTransaction(hre, connection.chainId, hash);

      const receipt = await connection.publicClient.waitForTransactionReceipt({
        hash,
      });
      const config = await priceBook.read.tokenConfig([token.address]);

      console.log(`Confirmed in block ${receipt.blockNumber}`);
      console.log(
        `Stored config: enabled=${config.enabled}, price3=${config.price3}, price4=${config.price4}, price5Plus=${config.price5Plus}`,
      );
    })
    .build(),
  task(
    ["gns-price-book", "disable-token"],
    "Call GNSPriceBook.disableToken using the Ignition deployment for the selected network",
  )
    .addOption({
      name: "token",
      description: "ERC20 payment token address",
      type: ArgumentType.STRING_WITHOUT_DEFAULT,
      defaultValue: undefined,
    })
    .setInlineAction(async (taskArguments, hre) => {
      const connection = await connectTask(hre);
      const priceBookAddress = await resolvePriceBookAddress(
        hre,
        connection.chainId,
      );
      const tokenAddress = requireAddressOption("token", taskArguments.token);
      const token = await getTokenMetadata(
        connection.publicClient,
        tokenAddress,
      );
      const priceBook = getPriceBookContract(connection, priceBookAddress);

      logTaskContext({
        action: "disableToken",
        networkName: connection.networkName,
        chainId: connection.chainId,
        sender: connection.walletClient.account.address,
        priceBookAddress,
        token,
      });

      const hash = await priceBook.write.disableToken([token.address]);

      logSubmittedTransaction(hre, connection.chainId, hash);

      const receipt = await connection.publicClient.waitForTransactionReceipt({
        hash,
      });
      const config = await priceBook.read.tokenConfig([token.address]);

      console.log(`Confirmed in block ${receipt.blockNumber}`);
      console.log(
        `Stored config after disable: enabled=${config.enabled}, price3=${config.price3}, price4=${config.price4}, price5Plus=${config.price5Plus}`,
      );
    })
    .build(),
];
