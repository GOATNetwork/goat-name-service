// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IEip3009
/// @notice Minimal interface for receiveWithAuthorization token pulls.
interface IEip3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
