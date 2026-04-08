// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MockERC20PermitToken
/// @notice Mints test ERC20 balances and supports EIP-2612 permits for integration tests.
/// @dev Access: permissionless minting is acceptable because this contract is only used in local tests.
contract MockERC20PermitToken is ERC20, ERC20Permit {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    /// @notice Deploys a mock token with the provided metadata.
    /// @param tokenName The ERC20 name and permit domain name.
    /// @param tokenSymbol The ERC20 symbol.
    constructor(
        string memory tokenName,
        string memory tokenSymbol
    ) ERC20(tokenName, tokenSymbol) ERC20Permit(tokenName) {}

    /// @notice Mints tokens to `to`.
    /// @dev Access: permissionless for test setup convenience.
    /// @param to The account receiving newly minted tokens.
    /// @param amount The number of smallest token units to mint.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

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
    ) external {
        require(block.timestamp > validAfter, "AUTH_NOT_YET_VALID");
        require(block.timestamp < validBefore, "AUTH_EXPIRED");
        require(to == msg.sender, "CALLER_MUST_BE_PAYEE");
        require(!authorizationState[from][nonce], "AUTH_ALREADY_USED");

        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        require(signer == from, "INVALID_AUTH_SIGNATURE");

        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}
