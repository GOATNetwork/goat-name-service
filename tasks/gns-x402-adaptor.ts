import { readFile } from "node:fs/promises";

import { emptyTask, task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { getAddress, getContract, type Address } from "viem";

const GNS_X402_ADAPTOR_DEPLOYMENT_KEY = "GNSX402AdaptorModule#GNSX402Adaptor";

const gnsX402AdaptorAbi = [
  {
    type: "function",
    name: "authorizedCallers",
    stateMutability: "view",
    inputs: [{ name: "caller", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setAuthorizedCaller",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caller", type: "address" },
      { name: "authorized", type: "bool" },
    ],
    outputs: [],
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

async function connectTask(hre: HardhatRuntimeEnvironment) {
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
    walletClient: walletClient as WalletClientWithAccount,
  };
}

async function resolveAdaptorAddress(chainId: number): Promise<Address> {
  const deploymentPath = new URL(
    `../ignition/deployments/chain-${chainId}/deployed_addresses.json`,
    import.meta.url,
  );

  let deployments: Record<string, string>;

  try {
    deployments = JSON.parse(await readFile(deploymentPath, "utf8")) as Record<
      string,
      string
    >;
  } catch (error) {
    throw new Error(
      `Cannot read Ignition deployment addresses for chainId ${chainId} at ${deploymentPath.pathname}.`,
      { cause: error },
    );
  }

  const adaptorAddress = deployments[GNS_X402_ADAPTOR_DEPLOYMENT_KEY];
  if (adaptorAddress === undefined) {
    throw new Error(
      `Missing ${GNS_X402_ADAPTOR_DEPLOYMENT_KEY} in ${deploymentPath.pathname}.`,
    );
  }

  return getAddress(adaptorAddress);
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

function toCliOption(name: string): string {
  return name
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replace(/([0-9])([a-zA-Z])/g, "$1-$2")
    .toLowerCase();
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

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export const gnsX402AdaptorTasks = [
  emptyTask(
    "gns-x402-adaptor",
    "Manage the deployed GNSX402Adaptor contract",
  ).build(),
  task(
    ["gns-x402-adaptor", "set-authorized-caller"],
    "Call GNSX402Adaptor.setAuthorizedCaller using the Ignition deployment for the selected network",
  )
    .addOption({
      name: "caller",
      description: "Caller address to update",
      type: ArgumentType.STRING_WITHOUT_DEFAULT,
      defaultValue: undefined,
    })
    .addOption({
      name: "authorized",
      description: "Whether the caller should be authorized",
      type: ArgumentType.BOOLEAN,
      defaultValue: true,
    })
    .setInlineAction(async (taskArguments, hre) => {
      const connection = await connectTask(hre);
      const adaptorAddress = await resolveAdaptorAddress(connection.chainId);
      const caller = requireAddressOption("caller", taskArguments.caller);
      const adaptor = getContract({
        address: adaptorAddress,
        abi: gnsX402AdaptorAbi,
        client: {
          public: connection.publicClient,
          wallet: connection.walletClient,
        },
      });

      console.log("Action: setAuthorizedCaller");
      console.log(
        `Network: ${connection.networkName} (chainId ${connection.chainId})`,
      );
      console.log(`Sender: ${connection.walletClient.account.address}`);
      console.log(`GNSX402Adaptor: ${adaptorAddress}`);
      console.log(`Caller: ${caller}`);
      console.log(`Authorized: ${taskArguments.authorized}`);

      const hash = await adaptor.write.setAuthorizedCaller([
        caller,
        taskArguments.authorized,
      ]);

      console.log(`Submitted transaction: ${hash}`);
      const explorerUrl = getTransactionExplorerUrl(
        hre,
        connection.chainId,
        hash,
      );
      if (explorerUrl !== undefined) {
        console.log(`Explorer: ${explorerUrl}`);
      }

      const receipt = await connection.publicClient.waitForTransactionReceipt({
        hash,
      });
      const isAuthorized = await adaptor.read.authorizedCallers([caller]);

      console.log(`Confirmed in block ${receipt.blockNumber}`);
      console.log(`authorizedCallers(${caller}) = ${isAuthorized}`);
    })
    .build(),
];
