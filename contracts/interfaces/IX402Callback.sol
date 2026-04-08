// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IX402Callback
/// @notice Official x402 callback interface used by GoatX402 callback targets.
interface IX402Callback {
    function x402SpentEip3009(
        address token,
        address originalPayer,
        address owner,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function x402SpentPermit2(
        address permit2,
        address token,
        address originalPayer,
        address owner,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external;

    function x402SpentEip3009WithCalldata(
        address token,
        address originalPayer,
        address owner,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes calldata calldata_,
        bytes32 orderId,
        uint256 calldataNonce,
        uint256 calldataDeadline,
        uint8 calldataV,
        bytes32 calldataR,
        bytes32 calldataS
    ) external;

    function x402SpentPermit2WithCalldata(
        address permit2,
        address token,
        address originalPayer,
        address owner,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata calldata_,
        bytes32 orderId,
        uint256 calldataNonce,
        uint256 calldataDeadline,
        uint8 calldataV,
        bytes32 calldataR,
        bytes32 calldataS
    ) external;
}
