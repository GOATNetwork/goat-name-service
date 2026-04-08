import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { zeroHash } from "viem";
import { labelhash, namehash } from "viem/ens";

const ROOT_NODE = zeroHash;
const GOAT_NODE = namehash("goat");
const GOAT_LABELHASH = labelhash("goat");
const REVERSE_NODE = namehash("reverse");
const REVERSE_LABELHASH = labelhash("reverse");
const ADDR_LABELHASH = labelhash("addr");

export default buildModule("GNSModule", (m) => {
  const deployer = m.getAccount(0);
  const treasury = m.getParameter("treasury", deployer);
  const metadataUri = m.getParameter(
    "metadataUri",
    "https://gns-meta.goat.network/name/0x{id}",
  );
  const minCommitmentAge = m.getParameter("minCommitmentAge", 60n);
  const maxCommitmentAge = m.getParameter("maxCommitmentAge", 86_400n);

  const ensRegistry = m.contract("ENSRegistry", [], { from: deployer });
  const baseRegistrar = m.contract(
    "BaseRegistrarImplementation",
    [ensRegistry, GOAT_NODE],
    { from: deployer },
  );
  const reverseRegistrar = m.contract("ReverseRegistrar", [ensRegistry], {
    from: deployer,
  });

  const reverseOwner = m.call(
    ensRegistry,
    "setSubnodeOwner",
    [ROOT_NODE, REVERSE_LABELHASH, deployer],
    { id: "setReverseOwner", from: deployer, after: [ensRegistry] },
  );

  const addrReverseOwner = m.call(
    ensRegistry,
    "setSubnodeOwner",
    [REVERSE_NODE, ADDR_LABELHASH, reverseRegistrar],
    {
      id: "setAddrReverseOwner",
      from: deployer,
      after: [reverseOwner, reverseRegistrar],
    },
  );

  const staticMetadataService = m.contract(
    "StaticMetadataService",
    [metadataUri],
    { from: deployer },
  );

  const goatNameWrapper = m.contract(
    "GoatNameWrapper",
    [ensRegistry, baseRegistrar, staticMetadataService],
    { from: deployer, after: [addrReverseOwner] },
  );

  const gnsPriceBook = m.contract("GNSPriceBook", [], { from: deployer });
  const gnsRegistrarController = m.contract(
    "GNSRegistrarController",
    [
      baseRegistrar,
      gnsPriceBook,
      minCommitmentAge,
      maxCommitmentAge,
      reverseRegistrar,
      ensRegistry,
      treasury,
    ],
    { from: deployer },
  );
  const x402SettlementOperator = m.getParameter(
    "x402SettlementOperator",
    deployer,
  );
  const gnsX402Adaptor = m.contract(
    "GNSX402Adaptor",
    [gnsRegistrarController, x402SettlementOperator],
    { from: deployer, after: [gnsRegistrarController] },
  );

  const publicResolver = m.contract(
    "PublicResolver",
    [ensRegistry, goatNameWrapper, gnsRegistrarController, reverseRegistrar],
    { from: deployer, after: [addrReverseOwner, gnsRegistrarController] },
  );

  const goatRecord = m.call(
    ensRegistry,
    "setSubnodeRecord",
    [ROOT_NODE, GOAT_LABELHASH, deployer, publicResolver, 0n],
    { id: "setGoatRecord", from: deployer, after: [publicResolver] },
  );

  const controllerInterfaceId = m.staticCall(
    gnsRegistrarController,
    "interfaceId",
    [],
  );
  const wrapperInterfaceId = m.staticCall(goatNameWrapper, "interfaceId", []);

  const reverseDefaultResolver = m.call(
    reverseRegistrar,
    "setDefaultResolver",
    [publicResolver],
    {
      id: "setReverseDefaultResolver",
      from: deployer,
      after: [publicResolver],
    },
  );

  const controllerInterface = m.call(
    publicResolver,
    "setInterface",
    [GOAT_NODE, controllerInterfaceId, gnsRegistrarController],
    { id: "setControllerInterface", from: deployer, after: [goatRecord] },
  );

  const wrapperInterface = m.call(
    publicResolver,
    "setInterface",
    [GOAT_NODE, wrapperInterfaceId, goatNameWrapper],
    { id: "setWrapperInterface", from: deployer, after: [goatRecord] },
  );

  const goatOwner = m.call(
    ensRegistry,
    "setSubnodeOwner",
    [ROOT_NODE, GOAT_LABELHASH, baseRegistrar],
    {
      id: "setGoatOwner",
      from: deployer,
      after: [controllerInterface, wrapperInterface],
    },
  );

  const baseWrapperController = m.call(
    baseRegistrar,
    "addController",
    [goatNameWrapper],
    {
      id: "addWrapperController",
      from: deployer,
      after: [goatOwner, goatNameWrapper],
    },
  );

  const baseRegistrarController = m.call(
    baseRegistrar,
    "addController",
    [gnsRegistrarController],
    {
      id: "addRegistrarController",
      from: deployer,
      after: [goatOwner, gnsRegistrarController],
    },
  );

  const reverseRegistrarController = m.call(
    reverseRegistrar,
    "setController",
    [gnsRegistrarController, true],
    {
      id: "setReverseRegistrarController",
      from: deployer,
      after: [reverseDefaultResolver, gnsRegistrarController],
    },
  );

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    staticMetadataService,
    goatNameWrapper,
    gnsPriceBook,
    gnsRegistrarController,
    gnsX402Adaptor,
    publicResolver,
  };
});
