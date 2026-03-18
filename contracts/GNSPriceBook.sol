// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title GNSPriceBook
/// @notice Stores fixed annual `.goat` pricing buckets for whitelisted ERC20 payment tokens.
/// @dev Prices are denominated in the payment token's smallest unit per year and are prorated with ceiling rounding.
contract GNSPriceBook is Ownable {
    /// @notice Per-token pricing configuration for `.goat` registrations and renewals.
    /// @param enabled True when the token can be used for payment.
    /// @param price3 Annual price for 3-byte normalized labels.
    /// @param price4 Annual price for 4-byte normalized labels.
    /// @param price5Plus Annual price for labels with 5 or more normalized bytes.
    struct TokenConfig {
        bool enabled;
        uint256 price3;
        uint256 price4;
        uint256 price5Plus;
    }

    /// @notice Reverts when `token` is the zero address.
    error ZeroTokenAddress();

    /// @notice Reverts when `token` is not enabled for payments.
    /// @param token The unsupported ERC20 address.
    error UnsupportedPaymentToken(address token);

    /// @notice Reverts when `token` does not expose the expected ERC20 metadata interface.
    /// @param token The invalid ERC20 address.
    error InvalidPaymentToken(address token);

    /// @notice Reverts when a normalized label length is below the minimum fixed-price range.
    /// @param length The normalized label length in bytes.
    error InvalidLabelLength(uint256 length);

    /// @notice Emitted when a token price configuration is created or updated.
    /// @param token The ERC20 whose price buckets changed.
    /// @param price3 The annual 3-byte price.
    /// @param price4 The annual 4-byte price.
    /// @param price5Plus The annual 5+ byte price.
    event TokenConfigured(
        address indexed token,
        uint256 price3,
        uint256 price4,
        uint256 price5Plus
    );

    /// @notice Emitted when a token is removed from the payment whitelist.
    /// @param token The ERC20 that was disabled.
    event TokenDisabled(address indexed token);

    /// @notice The number of seconds used for one billing year.
    uint256 public constant YEAR = 365 days;

    mapping(address => TokenConfig) private _tokenConfigs;

    /// @notice Returns the stored configuration for `token`.
    /// @param token The ERC20 to inspect.
    /// @return config The token's enable flag and annual price buckets.
    function tokenConfig(
        address token
    ) external view returns (TokenConfig memory config) {
        return _tokenConfigs[token];
    }

    /// @notice Returns whether `token` is enabled for `.goat` payments.
    /// @param token The ERC20 to inspect.
    /// @return supported True when `token` is enabled.
    function isSupported(address token) external view returns (bool supported) {
        return _tokenConfigs[token].enabled;
    }

    /// @notice Sets or updates the annual price buckets for `token`.
    /// @dev Access: owner only. The call probes `decimals()` to reject EOAs and contracts that do not expose basic ERC20 metadata. Passing zero prices is allowed and results in free registrations for the affected bucket.
    /// @param token The ERC20 to configure.
    /// @param price3 The annual price for 3-byte labels.
    /// @param price4 The annual price for 4-byte labels.
    /// @param price5Plus The annual price for 5+ byte labels.
    function setTokenConfig(
        address token,
        uint256 price3,
        uint256 price4,
        uint256 price5Plus
    ) external onlyOwner {
        if (token == address(0)) {
            revert ZeroTokenAddress();
        }

        _validatePaymentToken(token);

        _tokenConfigs[token] = TokenConfig({
            enabled: true,
            price3: price3,
            price4: price4,
            price5Plus: price5Plus
        });

        emit TokenConfigured(token, price3, price4, price5Plus);
    }

    /// @notice Disables `token` for future `.goat` payments.
    /// @dev Access: owner only. The stored price buckets are deleted with the whitelist entry.
    /// @param token The ERC20 to disable.
    function disableToken(address token) external onlyOwner {
        if (token == address(0)) {
            revert ZeroTokenAddress();
        }

        delete _tokenConfigs[token];
        emit TokenDisabled(token);
    }

    /// @notice Returns the prorated token cost for a normalized label length and duration.
    /// @dev Reverts for unsupported payment tokens and lengths below `3`. Rounds up to avoid under-collecting dust.
    /// @param token The ERC20 used for payment.
    /// @param normalizedLabelLength The normalized label length in bytes.
    /// @param duration The registration or renewal duration in seconds.
    /// @return amount The prorated token amount owed.
    function quote(
        address token,
        uint256 normalizedLabelLength,
        uint256 duration
    ) public view returns (uint256 amount) {
        TokenConfig memory config = _enabledConfig(token);
        uint256 annualPrice = _annualPrice(config, normalizedLabelLength);
        return Math.mulDiv(annualPrice, duration, YEAR, Math.Rounding.Up);
    }

    /// @notice Returns the enabled configuration for `token`.
    /// @param token The ERC20 to inspect.
    /// @return config The enabled token configuration.
    function _enabledConfig(
        address token
    ) internal view returns (TokenConfig memory config) {
        if (token == address(0)) {
            revert ZeroTokenAddress();
        }

        config = _tokenConfigs[token];
        if (!config.enabled) {
            revert UnsupportedPaymentToken(token);
        }
    }

    /// @notice Validates that `token` exposes basic ERC20 metadata.
    /// @dev This is a best-effort interface probe and does not guarantee fully standard ERC20 behavior.
    /// @param token The ERC20 to inspect.
    function _validatePaymentToken(address token) internal view {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeCall(IERC20Metadata.decimals, ())
        );

        if (!success || data.length < 32) {
            revert InvalidPaymentToken(token);
        }

        abi.decode(data, (uint8));
    }

    /// @notice Returns the annual bucket price for a normalized label length.
    /// @param config The token configuration to read from.
    /// @param normalizedLabelLength The normalized label length in bytes.
    /// @return annualPrice The annual price for the corresponding bucket.
    function _annualPrice(
        TokenConfig memory config,
        uint256 normalizedLabelLength
    ) internal pure returns (uint256 annualPrice) {
        if (normalizedLabelLength < 3) {
            revert InvalidLabelLength(normalizedLabelLength);
        }

        if (normalizedLabelLength == 3) {
            return config.price3;
        }

        if (normalizedLabelLength == 4) {
            return config.price4;
        }

        return config.price5Plus;
    }
}
