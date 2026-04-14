import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("GNSX402AdaptorModule", (m) => {
  const owner = m.getAccount(0);
  const gnsRegistrarController = m.getParameter("gnsRegistrarController");
  const x402SettlementOperator = m.getParameter("x402SettlementOperator", owner);

  const gnsX402Adaptor = m.contract(
    "GNSX402Adaptor",
    [gnsRegistrarController, x402SettlementOperator],
    { from: owner },
  );

  return {
    gnsX402Adaptor,
  };
});
