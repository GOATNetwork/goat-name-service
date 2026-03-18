// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/// @title MockERC20PermitToken
/// @notice Mints test ERC20 balances and supports EIP-2612 permits for integration tests.
/// @dev Access: permissionless minting is acceptable because this contract is only used in local tests.
contract MockERC20PermitToken is ERC20, ERC20Permit {
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
}
