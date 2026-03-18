// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReverseRegistrar as UpstreamReverseRegistrar} from "@ensdomains/ens-contracts/contracts/reverseRegistrar/ReverseRegistrar.sol";
import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";

/// @title ReverseRegistrar
/// @notice Re-exports the upstream reverse registrar with a local artifact name for Hardhat Ignition.
/// @dev This contract only forwards constructor execution to the upstream implementation.
contract ReverseRegistrar is UpstreamReverseRegistrar {
    /// @notice Deploys the reverse registrar.
    /// @param ens_ The ENS registry.
    constructor(ENS ens_) UpstreamReverseRegistrar(ens_) {}
}
