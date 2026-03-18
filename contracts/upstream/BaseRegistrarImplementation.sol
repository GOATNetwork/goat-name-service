// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseRegistrarImplementation as UpstreamBaseRegistrarImplementation} from "@ensdomains/ens-contracts/contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";

/// @title BaseRegistrarImplementation
/// @notice Re-exports the upstream ENS base registrar with a local artifact name for Hardhat Ignition.
/// @dev This contract only forwards constructor execution to the upstream implementation.
contract BaseRegistrarImplementation is UpstreamBaseRegistrarImplementation {
    /// @notice Deploys the `.goat` base registrar.
    /// @param ens_ The ENS registry.
    /// @param baseNode_ The namehash of the `.goat` TLD.
    constructor(
        ENS ens_,
        bytes32 baseNode_
    ) UpstreamBaseRegistrarImplementation(ens_, baseNode_) {}
}
