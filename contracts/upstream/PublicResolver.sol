// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PublicResolver as UpstreamPublicResolver} from "@ensdomains/ens-contracts/contracts/resolvers/PublicResolver.sol";
import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import {INameWrapper} from "@ensdomains/ens-contracts/contracts/wrapper/INameWrapper.sol";

/// @title PublicResolver
/// @notice Re-exports the upstream ENS public resolver with a local artifact name for Hardhat Ignition.
/// @dev This contract only forwards constructor execution to the upstream implementation.
contract PublicResolver is UpstreamPublicResolver {
    /// @notice Deploys the public resolver.
    /// @param ens_ The ENS registry.
    /// @param wrapperAddress_ The name wrapper trusted by the resolver.
    /// @param trustedController_ The trusted `.goat` registrar controller.
    /// @param trustedReverseRegistrar_ The trusted reverse registrar.
    constructor(
        ENS ens_,
        INameWrapper wrapperAddress_,
        address trustedController_,
        address trustedReverseRegistrar_
    )
        UpstreamPublicResolver(
            ens_,
            wrapperAddress_,
            trustedController_,
            trustedReverseRegistrar_
        )
    {}
}
