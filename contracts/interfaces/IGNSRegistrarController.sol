// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IETHRegistrarController} from "@ensdomains/ens-contracts/contracts/ethregistrar/IETHRegistrarController.sol";

/// @title IGNSRegistrarController
/// @notice Defines the fixed-price registration and renewal interface for `.goat` second-level names.
/// @dev Commitments are built from the full registration request plus payment settings so the committed resolver and payment token cannot be changed at reveal time.
interface IGNSRegistrarController {
    /// @notice Reverts when a commitment is not found.
    /// @param commitment The missing commitment hash.
    error CommitmentNotFound(bytes32 commitment);

    /// @notice Reverts when a commitment has not aged long enough.
    /// @param commitment The commitment hash.
    /// @param minimumCommitmentTimestamp The first valid reveal timestamp.
    /// @param currentTimestamp The current block timestamp.
    error CommitmentTooNew(
        bytes32 commitment,
        uint256 minimumCommitmentTimestamp,
        uint256 currentTimestamp
    );

    /// @notice Reverts when a commitment has expired.
    /// @param commitment The expired commitment hash.
    /// @param maximumCommitmentTimestamp The last valid reveal timestamp.
    /// @param currentTimestamp The current block timestamp.
    error CommitmentTooOld(
        bytes32 commitment,
        uint256 maximumCommitmentTimestamp,
        uint256 currentTimestamp
    );

    /// @notice Reverts when a matching unexpired commitment already exists.
    /// @param commitment The reused commitment hash.
    error UnexpiredCommitmentExists(bytes32 commitment);

    /// @notice Reverts when the requested label is unavailable.
    /// @param label The label that cannot be registered.
    error NameNotAvailable(string label);

    /// @notice Reverts when `duration` is shorter than the controller minimum registration duration.
    /// @param duration The invalid duration in seconds.
    error DurationTooShort(uint256 duration);

    /// @notice Reverts when resolver calldata is supplied without a resolver address.
    error ResolverRequiredWhenDataSupplied();

    /// @notice Reverts when reverse record setup is requested without a resolver.
    error ResolverRequiredForReverseRecord();

    /// @notice Reverts when a normalized label length is below the minimum fixed-price range.
    /// @param length The normalized label length in bytes.
    error InvalidLabelLength(uint256 length);

    /// @notice Reverts when a quoted payment exceeds the caller's limit.
    /// @param actualPaymentAmount The quoted amount required by the controller.
    /// @param maxPaymentAmount The maximum amount accepted by the caller.
    error MaxPaymentExceeded(
        uint256 actualPaymentAmount,
        uint256 maxPaymentAmount
    );

    /// @notice Reverts when `maxCommitmentAge` is not strictly greater than `minCommitmentAge`.
    error MaxCommitmentAgeTooLow();

    /// @notice Reverts when `maxCommitmentAge` is unreasonably high for the current block timestamp.
    error MaxCommitmentAgeTooHigh();

    /// @notice Emitted when a `.goat` name is registered.
    /// @param label The registered label.
    /// @param labelhash The keccak256 hash of `label`.
    /// @param owner The recipient of the unwrapped registrar ERC721.
    /// @param paymentToken The ERC20 used for payment.
    /// @param cost The token amount paid.
    /// @param expires The new registrar expiry timestamp.
    event NameRegistered(
        string label,
        bytes32 indexed labelhash,
        address indexed owner,
        address indexed paymentToken,
        uint256 cost,
        uint256 expires
    );

    /// @notice Emitted when a `.goat` name is renewed.
    /// @param label The renewed label.
    /// @param labelhash The keccak256 hash of `label`.
    /// @param paymentToken The ERC20 used for payment.
    /// @param cost The token amount paid.
    /// @param expires The new registrar expiry timestamp.
    event NameRenewed(
        string label,
        bytes32 indexed labelhash,
        address indexed paymentToken,
        uint256 cost,
        uint256 expires
    );

    /// @notice Emitted when the treasury address changes.
    /// @param treasury The new treasury receiving registration payments.
    event TreasuryUpdated(address indexed treasury);

    /// @notice Payment parameters for a `.goat` registration or renewal.
    /// @dev `paymentToken` is committed alongside the ENS registration struct so reveal-time token substitution is impossible for commitment-based registrations.
    /// @param paymentToken The whitelisted ERC20 used for payment.
    /// @param maxPaymentAmount The maximum token amount the caller is willing to spend.
    struct PaymentRequest {
        address paymentToken;
        uint256 maxPaymentAmount;
    }

    /// @notice EIP-2612 permit data used to approve token transfers inline with registration or renewal.
    /// @param value The allowance value signed for the controller.
    /// @param deadline The permit deadline timestamp.
    /// @param v The signature recovery byte.
    /// @param r The signature `r` value.
    /// @param s The signature `s` value.
    struct PermitParams {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Returns whether `label` is valid for fixed-price registration and currently available.
    /// @param label The normalized label to query.
    /// @return isAvailable True when the label length is in range and the registrar reports it as available.
    function available(
        string calldata label
    ) external view returns (bool isAvailable);

    /// @notice Returns the ERC20 amount required to rent `label` for `duration`.
    /// @param label The normalized label to price.
    /// @param paymentToken The whitelisted ERC20 used for payment.
    /// @param duration The requested registration or renewal duration in seconds.
    /// @return amount The prorated token amount owed.
    function rentPrice(
        string calldata label,
        address paymentToken,
        uint256 duration
    ) external view returns (uint256 amount);

    /// @notice Returns the commitment hash for a registration request.
    /// @param registration The ENS-style registration request to commit to.
    /// @param payment The ERC20 payment settings to commit to.
    /// @return commitment The hash that must be submitted through `commit`.
    function makeCommitment(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment
    ) external pure returns (bytes32 commitment);

    /// @notice Stores a registration commitment.
    /// @param commitment The commitment hash returned by `makeCommitment`.
    function commit(bytes32 commitment) external;

    /// @notice Registers a new `.goat` name with a pre-approved ERC20 allowance.
    /// @param registration The ENS-style registration request to reveal and execute.
    /// @param payment The ERC20 payment settings to use for the registration.
    function register(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment
    ) external;

    /// @notice Registers a new `.goat` name using an inline EIP-2612 permit approval.
    /// @param registration The ENS-style registration request to reveal and execute.
    /// @param payment The ERC20 payment settings to use for the registration.
    /// @param permit The permit signature approving `payment.paymentToken`.
    function registerWithPermit(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment,
        PermitParams calldata permit
    ) external;

    /// @notice Renews an existing `.goat` name using a pre-approved ERC20 allowance.
    /// @param label The normalized label to renew.
    /// @param payment The ERC20 payment settings to use for the renewal.
    /// @param duration The renewal duration in seconds.
    function renew(
        string calldata label,
        PaymentRequest calldata payment,
        uint256 duration
    ) external;

    /// @notice Renews an existing `.goat` name using an inline EIP-2612 permit approval.
    /// @param label The normalized label to renew.
    /// @param payment The ERC20 payment settings to use for the renewal.
    /// @param duration The renewal duration in seconds.
    /// @param permit The permit signature approving `payment.paymentToken`.
    function renewWithPermit(
        string calldata label,
        PaymentRequest calldata payment,
        uint256 duration,
        PermitParams calldata permit
    ) external;
}
