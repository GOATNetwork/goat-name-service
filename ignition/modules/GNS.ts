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
  const owner = m.getAccount(0);
  const metadataUri = m.getParameter(
    "metadataUri",
    "https://gns-meta.goat.network/name/0x{id}",
  );
  const minCommitmentAge = m.getParameter("minCommitmentAge", 60n);
  const maxCommitmentAge = m.getParameter("maxCommitmentAge", 86_400n);

  const ensRegistry = m.contract("ENSRegistry", [], { from: owner });
  const baseRegistrar = m.contract(
    "BaseRegistrarImplementation",
    [ensRegistry, GOAT_NODE],
    { from: owner },
  );
  const reverseRegistrar = m.contract("ReverseRegistrar", [ensRegistry], {
    from: owner,
  });

  const reverseOwner = m.call(
    ensRegistry,
    "setSubnodeOwner",
    [ROOT_NODE, REVERSE_LABELHASH, owner],
    { id: "setReverseOwner", from: owner, after: [ensRegistry] },
  );

  const addrReverseOwner = m.call(
    ensRegistry,
    "setSubnodeOwner",
    [REVERSE_NODE, ADDR_LABELHASH, reverseRegistrar],
    {
      id: "setAddrReverseOwner",
      from: owner,
      after: [reverseOwner, reverseRegistrar],
    },
  );

  const staticMetadataService = m.contract(
    "StaticMetadataService",
    [metadataUri],
    { from: owner },
  );

  const goatNameWrapper = m.contract(
    "GoatNameWrapper",
    [ensRegistry, baseRegistrar, staticMetadataService],
    { from: owner, after: [addrReverseOwner] },
  );

  const gnsPriceBook = m.contract("GNSPriceBook", [], { from: owner });
  const gnsRegistrarController = m.contract(
    "GNSRegistrarController",
    [
      baseRegistrar,
      gnsPriceBook,
      minCommitmentAge,
      maxCommitmentAge,
      reverseRegistrar,
      ensRegistry,
      owner,
    ],
    { from: owner },
  );

  const publicResolver = m.contract(
    "PublicResolver",
    [ensRegistry, goatNameWrapper, gnsRegistrarController, reverseRegistrar],
    { from: owner, after: [addrReverseOwner, gnsRegistrarController] },
  );

  const goatRecord = m.call(
    ensRegistry,
    "setSubnodeRecord",
    [ROOT_NODE, GOAT_LABELHASH, owner, publicResolver, 0n],
    { id: "setGoatRecord", from: owner, after: [publicResolver] },
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
    { id: "setReverseDefaultResolver", from: owner, after: [publicResolver] },
  );

  const controllerInterface = m.call(
    publicResolver,
    "setInterface",
    [GOAT_NODE, controllerInterfaceId, gnsRegistrarController],
    { id: "setControllerInterface", from: owner, after: [goatRecord] },
  );

  const wrapperInterface = m.call(
    publicResolver,
    "setInterface",
    [GOAT_NODE, wrapperInterfaceId, goatNameWrapper],
    { id: "setWrapperInterface", from: owner, after: [goatRecord] },
  );

  const goatOwner = m.call(
    ensRegistry,
    "setSubnodeOwner",
    [ROOT_NODE, GOAT_LABELHASH, baseRegistrar],
    {
      id: "setGoatOwner",
      from: owner,
      after: [controllerInterface, wrapperInterface],
    },
  );

  const baseWrapperController = m.call(
    baseRegistrar,
    "addController",
    [goatNameWrapper],
    {
      id: "addWrapperController",
      from: owner,
      after: [goatOwner, goatNameWrapper],
    },
  );

  const baseRegistrarController = m.call(
    baseRegistrar,
    "addController",
    [gnsRegistrarController],
    {
      id: "addRegistrarController",
      from: owner,
      after: [goatOwner, gnsRegistrarController],
    },
  );

  const reverseRegistrarController = m.call(
    reverseRegistrar,
    "setController",
    [gnsRegistrarController, true],
    {
      id: "setReverseRegistrarController",
      from: owner,
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
    publicResolver,
  };
});
