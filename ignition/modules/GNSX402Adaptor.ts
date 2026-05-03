import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("GNSX402AdaptorModule", (m) => {
  const owner = m.getAccount(0);
  const gnsRegistrarController = m.getParameter("gnsRegistrarController");
  const x402AuthorizedCaller = m.getParameter("x402AuthorizedCaller", owner);

  const gnsX402Adaptor = m.contract(
    "GNSX402Adaptor",
    [gnsRegistrarController, x402AuthorizedCaller],
    { from: owner },
  );

  return {
    gnsX402Adaptor,
  };
});
