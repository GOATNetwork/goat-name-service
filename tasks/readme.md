# GNSPriceBook Tasks

These Hardhat tasks manage the deployed `GNSPriceBook` payment-token whitelist.

The tasks resolve the `GNSPriceBook` address through Hardhat Ignition's public APIs in `@nomicfoundation/ignition-core`, using the selected network's default Ignition deployment ID (`chain-<chainId>`), so you only need to provide the token and pricing parameters.

## `set-token-config`

This task reads `decimals()` from the target ERC20 and converts `--price-3`, `--price-4`, and `--price-5-plus` from whole-token values into the smallest token unit before calling `setTokenConfig`.

```sh
npx hardhat --network testnet3 gns-price-book set-token-config \
  --token 0xYourPaymentToken \
  --price-3 100 \
  --price-4 30 \
  --price-5-plus 3
```

Mainnet usage:

```sh
npx hardhat --network mainnet gns-price-book set-token-config \
  --token 0xYourPaymentToken \
  --price-3 100 \
  --price-4 30 \
  --price-5-plus 3
```

## `disable-token`

This task removes a token from the payment whitelist by calling `disableToken`.

```sh
npx hardhat --network testnet3 gns-price-book disable-token \
  --token 0xYourPaymentToken
```

Mainnet usage:

```sh
npx hardhat --network mainnet gns-price-book disable-token \
  --token 0xYourPaymentToken
```

## Notes

- The task resolves `GNSModule#GNSPriceBook` from the selected network's Ignition deployment via `listDeployments()` and `status()` from `@nomicfoundation/ignition-core`.
- `hardhat.config.ts` expects `GOAT_TESTNET3_DEPLOY_PRIVATE_KEY` for `testnet3`.
- `hardhat.config.ts` expects `GOAT_MAINNET_DEPLOY_PRIVATE_KEY` for `mainnet`.
- The caller must be the `owner` of the target `GNSPriceBook` contract.

## Testnet3 Tokens

```
TestUSDC - 0xFCA5846c86dC8Df1B1e21447649A08a18B667B92
TestUSDT - 0x030B2C744Fa080D97c0033214dEF6384f763aB21
```
