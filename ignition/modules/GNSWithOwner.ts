import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { zeroHash } from "viem";
import { namehash } from "viem/ens";

import GNSModule from "./GNS.js";

const ROOT_NODE = zeroHash;
const REVERSE_NODE = namehash("reverse");

export default buildModule("GNSWithOwnerModule", (m) => {
  const deployer = m.getAccount(0);
  const owner = m.getParameter("owner");

  const deployment = m.useModule(GNSModule);

  m.call(deployment.ensRegistry, "setOwner", [ROOT_NODE, owner], {
    id: "transferRootOwner",
    from: deployer,
    after: [GNSModule],
  });

  m.call(deployment.ensRegistry, "setOwner", [REVERSE_NODE, owner], {
    id: "transferReverseOwner",
    from: deployer,
    after: [GNSModule],
  });

  m.call(deployment.baseRegistrar, "transferOwnership", [owner], {
    id: "transferBaseRegistrarOwnership",
    from: deployer,
    after: [GNSModule],
  });

  m.call(deployment.reverseRegistrar, "transferOwnership", [owner], {
    id: "transferReverseRegistrarOwnership",
    from: deployer,
    after: [GNSModule],
  });

  m.call(deployment.goatNameWrapper, "transferOwnership", [owner], {
    id: "transferGoatNameWrapperOwnership",
    from: deployer,
    after: [GNSModule],
  });

  m.call(deployment.gnsPriceBook, "transferOwnership", [owner], {
    id: "transferGNSPriceBookOwnership",
    from: deployer,
    after: [GNSModule],
  });

  m.call(deployment.gnsRegistrarController, "transferOwnership", [owner], {
    id: "transferGNSRegistrarControllerOwnership",
    from: deployer,
    after: [GNSModule],
  });

  m.call(deployment.gnsX402Adaptor, "transferOwnership", [owner], {
    id: "transferGNSX402AdaptorOwnership",
    from: deployer,
    after: [GNSModule],
  });

  return deployment;
});
