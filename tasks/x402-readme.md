# GNSX402Adaptor Tasks

These Hardhat tasks manage the deployed `GNSX402Adaptor` authorized-caller list.

The task automatically reads the `GNSX402Adaptor` address from `ignition/deployments/chain-<chainId>/deployed_addresses.json` using the selected network's `chainId`.

## `set-authorized-caller`

This task calls `setAuthorizedCaller(caller, authorized)` on the deployed adaptor.

Authorize a caller on testnet3:

```sh
npx hardhat --network testnet3 gns-x402-adaptor set-authorized-caller \
  --caller 0xA58917dB2712F1c09D0078aeee1BA3ED8eD3565a
```

Revoke a caller on testnet3:

```sh
npx hardhat --network testnet3 gns-x402-adaptor set-authorized-caller \
  --caller 0xA58917dB2712F1c09D0078aeee1BA3ED8eD3565a \
  --authorized false
```

## Notes

- The task resolves `GNSX402AdaptorModule#GNSX402Adaptor` from the Ignition deployment of the selected network.
- `hardhat.config.ts` expects `GOAT_TESTNET3_DEPLOY_PRIVATE_KEY` for `testnet3`.
- `hardhat.config.ts` expects `GOAT_MAINNET_DEPLOY_PRIVATE_KEY` for `mainnet`.
- The sender must be the `owner` of the target `GNSX402Adaptor` contract.
