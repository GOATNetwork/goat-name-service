// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ENSRegistry as UpstreamENSRegistry} from "@ensdomains/ens-contracts/contracts/registry/ENSRegistry.sol";

/// @title ENSRegistry
/// @notice Re-exports the upstream ENS registry with a local artifact name for Hardhat Ignition.
/// @dev This contract only forwards constructor execution to the upstream implementation.
contract ENSRegistry is UpstreamENSRegistry {}
