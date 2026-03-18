# Goat Name Service

An ENS-compatible `.goat` name service built on Hardhat 3, `node:test`, and `viem`.

## Stack

- ENS upstream contracts: `ENSRegistry`, `BaseRegistrarImplementation`, `PublicResolver`, `ReverseRegistrar`, `StaticMetadataService`
- Custom contracts: `GNSPriceBook`, `GNSRegistrarController`, `GoatNameWrapper`
- Deployment: Hardhat Ignition module at `ignition/modules/GNS.ts`
- Tests: integration coverage in `test/GNS.ts`

## Features

- `.goat` ENS-style registry, resolver, reverse registrar, registrar, and wrapper stack
- Fixed-price ERC20 registrations and renewals for normalized labels with length `3+`
- Per-token annual pricing buckets for `3`, `4`, and `5+` byte names
- `approve + transferFrom` and EIP-2612 `permit` payment flows
- ENS-style `commit -> wait -> register` flow for new registrations
- Manual `.goat` wrapping, wrapped-name renewals, and wrapped subdomain management

## Requirements

- Final acceptance target: Node 22 LTS
- Local development in this workspace currently runs on Node 25, which Hardhat warns about but still compiled and ran the test suite during implementation

## Usage

Install dependencies:

```sh
npm ci
```

Compile contracts:

```sh
npm run compile
```

Run the integration test suite:

```sh
npm test
```

## Deployment Notes

The Ignition module deploys and initializes the full `.goat` stack in one flow:

1. Deploy `ENSRegistry`, `.goat` `BaseRegistrarImplementation`, `ReverseRegistrar`, `StaticMetadataService`, `GoatNameWrapper`, `GNSPriceBook`, `GNSRegistrarController`, and `PublicResolver`
2. Initialize `reverse` and `addr.reverse`
3. Install `.goat` resolver records and interface records for the controller and wrapper
4. Transfer `.goat` ownership to the base registrar
5. Authorize the controller on the registrar, wrapper, and reverse registrar

The module defaults the treasury to the deployer account and exposes configurable `metadataUri`, `minCommitmentAge`, and `maxCommitmentAge` parameters.
