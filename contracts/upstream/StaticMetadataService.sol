// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {StaticMetadataService as UpstreamStaticMetadataService} from "@ensdomains/ens-contracts/contracts/wrapper/StaticMetadataService.sol";

/// @title StaticMetadataService
/// @notice Re-exports the upstream static metadata service with a local artifact name for Hardhat Ignition.
/// @dev This contract only forwards constructor execution to the upstream implementation.
contract StaticMetadataService is UpstreamStaticMetadataService {
    /// @notice Deploys the static metadata service.
    /// @param metadataUri The metadata URI template returned for every wrapped token.
    constructor(
        string memory metadataUri
    ) UpstreamStaticMetadataService(metadataUri) {}
}
