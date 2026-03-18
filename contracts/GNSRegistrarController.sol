// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseRegistrarImplementation} from "@ensdomains/ens-contracts/contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {IETHRegistrarController} from "@ensdomains/ens-contracts/contracts/ethregistrar/IETHRegistrarController.sol";
import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import {Resolver} from "@ensdomains/ens-contracts/contracts/resolvers/Resolver.sol";
import {IReverseRegistrar} from "@ensdomains/ens-contracts/contracts/reverseRegistrar/IReverseRegistrar.sol";
import {INameWrapper} from "@ensdomains/ens-contracts/contracts/wrapper/INameWrapper.sol";
import {StringUtils} from "@ensdomains/ens-contracts/contracts/utils/StringUtils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";

import {GNSPriceBook} from "./GNSPriceBook.sol";
import {IGNSRegistrarController} from "./interfaces/IGNSRegistrarController.sol";

/// @title GNSRegistrarController
/// @notice Registers and renews fixed-price `.goat` second-level names using whitelisted ERC20 payments.
/// @dev
/// - Access: registrations and renewals are permissionless; admin actions are owner only.
/// - Commitments bind the full registration request plus payment settings to reduce frontrun-driven owner, resolver, or payment-token changes.
/// - Payments assume standard ERC20 behavior. Fee-on-transfer, rebasing, and ERC777 hook semantics are unsupported.
/// - Resolver writes are executed only through `multicallWithNodeCheck` on the configured resolver.
contract GNSRegistrarController is Ownable, ERC165, IGNSRegistrarController {
    using SafeERC20 for IERC20;
    using StringUtils for *;

    /// @notice The upstream ENS reverse-record bit for the EVM address reverse path.
    uint8 internal constant REVERSE_RECORD_ETHEREUM_BIT = 1;

    /// @notice The minimum registration or renewal duration.
    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;

    /// @notice The ENS registry used by the `.goat` registrar stack.
    ENS public immutable ens;

    /// @notice The base registrar that owns `namehash("goat")`.
    BaseRegistrarImplementation public immutable baseRegistrar;

    /// @notice The price book used to quote ERC20 payments.
    GNSPriceBook public immutable priceBook;

    /// @notice The reverse registrar used for `addr.reverse`.
    IReverseRegistrar public immutable reverseRegistrar;

    /// @notice The `.goat` name wrapper used for wrapped-name renewals.
    INameWrapper public immutable nameWrapper;

    /// @notice The namehash of the `.goat` TLD managed by `baseRegistrar`.
    bytes32 public immutable baseNode;

    /// @notice The minimum time that a commitment must exist before reveal.
    uint256 public immutable minCommitmentAge;

    /// @notice The maximum time that a commitment remains valid.
    uint256 public immutable maxCommitmentAge;

    /// @notice The treasury that receives ERC20 registration and renewal payments.
    address public treasury;

    /// @notice A mapping of stored commitments to their creation timestamps.
    mapping(bytes32 => uint256) public commitments;

    /// @notice Deploys the `.goat` registrar controller.
    /// @dev The controller trusts `baseRegistrar` to enforce rental availability and grace-period renewal rules.
    /// @param _baseRegistrar The `.goat` base registrar.
    /// @param _priceBook The ERC20 pricing book.
    /// @param _minCommitmentAge The minimum commitment age in seconds.
    /// @param _maxCommitmentAge The maximum commitment age in seconds.
    /// @param _reverseRegistrar The `addr.reverse` registrar.
    /// @param _nameWrapper The `.goat` wrapper used for wrapped renewals.
    /// @param _ens The ENS registry.
    /// @param _treasury The treasury that receives ERC20 payments.
    constructor(
        BaseRegistrarImplementation _baseRegistrar,
        GNSPriceBook _priceBook,
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge,
        IReverseRegistrar _reverseRegistrar,
        INameWrapper _nameWrapper,
        ENS _ens,
        address _treasury
    ) {
        if (_maxCommitmentAge <= _minCommitmentAge) {
            revert MaxCommitmentAgeTooLow();
        }

        if (_maxCommitmentAge > block.timestamp) {
            revert MaxCommitmentAgeTooHigh();
        }

        ens = _ens;
        baseRegistrar = _baseRegistrar;
        priceBook = _priceBook;
        reverseRegistrar = _reverseRegistrar;
        nameWrapper = _nameWrapper;
        baseNode = _baseRegistrar.baseNode();
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;
        treasury = _treasury;
    }

    /// @notice Returns the ERC-165 interface id exposed through the `.goat` resolver.
    /// @return id The `IGNSRegistrarController` interface id.
    function interfaceId() external pure returns (bytes4 id) {
        return type(IGNSRegistrarController).interfaceId;
    }

    /// @notice Updates the treasury that receives ERC20 payments.
    /// @dev Access: owner only.
    /// @param newTreasury The new treasury address.
    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @inheritdoc IGNSRegistrarController
    function available(
        string calldata label
    ) external view override returns (bool isAvailable) {
        if (!valid(label)) {
            return false;
        }

        return baseRegistrar.available(uint256(keccak256(bytes(label))));
    }

    /// @notice Returns true if the normalized label is valid for registration.
    /// @dev Matches ENS upstream `ETHRegistrarController.valid`: labels shorter than 3 Unicode code points are rejected here.
    /// @param label The normalized `.goat` label to validate.
    /// @return isValid True when the label length is at least 3 according to `StringUtils.strlen`.
    function valid(string calldata label) public pure returns (bool isValid) {
        return _labelLength(label) >= 3;
    }

    /// @inheritdoc IGNSRegistrarController
    function rentPrice(
        string calldata label,
        address paymentToken,
        uint256 duration
    ) external view override returns (uint256 amount) {
        return priceBook.quote(paymentToken, _labelLength(label), duration);
    }

    /// @inheritdoc IGNSRegistrarController
    function makeCommitment(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment
    ) public pure override returns (bytes32 commitment) {
        _validateRegistration(registration);
        return keccak256(abi.encode(registration, payment));
    }

    /// @inheritdoc IGNSRegistrarController
    function commit(bytes32 commitment) external override {
        if (commitments[commitment] + maxCommitmentAge >= block.timestamp) {
            revert UnexpiredCommitmentExists(commitment);
        }

        commitments[commitment] = block.timestamp;
    }

    /// @inheritdoc IGNSRegistrarController
    function register(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment
    ) external override {
        uint256 amountDue = _quoteRegistrationPayment(registration, payment);
        _register(registration, payment, amountDue);
        _collectPayment(payment.paymentToken, amountDue);
    }

    /// @inheritdoc IGNSRegistrarController
    function registerWithPermit(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment,
        PermitParams calldata permit
    ) external override {
        uint256 amountDue = _quoteRegistrationPayment(registration, payment);
        _register(registration, payment, amountDue);
        _collectPaymentWithPermit(payment.paymentToken, amountDue, permit);
    }

    /// @inheritdoc IGNSRegistrarController
    function renew(
        string calldata label,
        address paymentToken,
        uint256 duration,
        uint256 maxPaymentAmount
    ) external override {
        uint256 amountDue = _quoteRenewalPayment(
            label,
            paymentToken,
            duration,
            maxPaymentAmount
        );
        _renew(label, paymentToken, duration, amountDue);
        _collectPayment(paymentToken, amountDue);
    }

    /// @inheritdoc IGNSRegistrarController
    function renewWithPermit(
        string calldata label,
        address paymentToken,
        uint256 duration,
        uint256 maxPaymentAmount,
        PermitParams calldata permit
    ) external override {
        uint256 amountDue = _quoteRenewalPayment(
            label,
            paymentToken,
            duration,
            maxPaymentAmount
        );
        _renew(label, paymentToken, duration, amountDue);
        _collectPaymentWithPermit(paymentToken, amountDue, permit);
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId_
    ) public view override returns (bool) {
        return
            interfaceId_ == type(IGNSRegistrarController).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId ||
            super.supportsInterface(interfaceId_);
    }

    /// @notice Validates and executes a new registration.
    /// @param registration The ENS-style registration request being revealed.
    /// @param payment The ERC20 payment settings accompanying the registration.
    /// @param amountDue The ERC20 amount already quoted and collected for the registration.
    function _register(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment,
        uint256 amountDue
    ) internal {
        bytes32 labelhash = keccak256(bytes(registration.label));
        uint256 tokenId = uint256(labelhash);

        if (!baseRegistrar.available(tokenId)) {
            revert NameNotAvailable(registration.label);
        }

        bytes32 commitment = makeCommitment(registration, payment);
        uint256 commitmentTimestamp = commitments[commitment];

        if (commitmentTimestamp + minCommitmentAge > block.timestamp) {
            revert CommitmentTooNew(
                commitment,
                commitmentTimestamp + minCommitmentAge,
                block.timestamp
            );
        }

        if (commitmentTimestamp + maxCommitmentAge <= block.timestamp) {
            if (commitmentTimestamp == 0) {
                revert CommitmentNotFound(commitment);
            }

            revert CommitmentTooOld(
                commitment,
                commitmentTimestamp + maxCommitmentAge,
                block.timestamp
            );
        }

        delete commitments[commitment];

        uint256 expires;
        if (registration.resolver == address(0)) {
            expires = baseRegistrar.register(
                tokenId,
                registration.owner,
                registration.duration
            );
        } else {
            expires = baseRegistrar.register(
                tokenId,
                address(this),
                registration.duration
            );
            _configureName(registration, labelhash, tokenId);
        }

        emit NameRegistered(
            registration.label,
            labelhash,
            registration.owner,
            payment.paymentToken,
            amountDue,
            expires
        );
    }

    /// @notice Validates and executes a renewal.
    /// @param label The normalized label to renew.
    /// @param paymentToken The ERC20 used for payment.
    /// @param duration The renewal duration in seconds.
    /// @param amountDue The ERC20 amount already quoted and collected for the renewal.
    function _renew(
        string calldata label,
        address paymentToken,
        uint256 duration,
        uint256 amountDue
    ) internal {
        if (duration < MIN_REGISTRATION_DURATION) {
            revert DurationTooShort(duration);
        }

        bytes32 labelhash = keccak256(bytes(label));
        uint256 expires = nameWrapper.renew(uint256(labelhash), duration);

        emit NameRenewed(label, labelhash, paymentToken, amountDue, expires);
    }

    /// @notice Quotes and validates the ERC20 payment for a registration.
    /// @param registration The ENS-style registration request.
    /// @param payment The ERC20 payment settings accompanying the registration.
    /// @return amountDue The token amount required for the registration.
    function _quoteRegistrationPayment(
        IETHRegistrarController.Registration calldata registration,
        PaymentRequest calldata payment
    ) internal view returns (uint256 amountDue) {
        amountDue = priceBook.quote(
            payment.paymentToken,
            _labelLength(registration.label),
            registration.duration
        );

        if (amountDue > payment.maxPaymentAmount) {
            revert MaxPaymentExceeded(amountDue, payment.maxPaymentAmount);
        }
    }

    /// @notice Quotes and validates the ERC20 payment for a renewal.
    /// @param label The normalized label to renew.
    /// @param paymentToken The ERC20 used for payment.
    /// @param duration The renewal duration in seconds.
    /// @param maxPaymentAmount The caller's maximum accepted payment.
    /// @return amountDue The token amount required for the renewal.
    function _quoteRenewalPayment(
        string calldata label,
        address paymentToken,
        uint256 duration,
        uint256 maxPaymentAmount
    ) internal view returns (uint256 amountDue) {
        amountDue = priceBook.quote(
            paymentToken,
            _labelLength(label),
            duration
        );

        if (amountDue > maxPaymentAmount) {
            revert MaxPaymentExceeded(amountDue, maxPaymentAmount);
        }
    }

    /// @notice Transfers ERC20 payment to the treasury.
    /// @param paymentToken The ERC20 used for payment.
    /// @param amountDue The amount to collect.
    function _collectPayment(address paymentToken, uint256 amountDue) internal {
        IERC20(paymentToken).safeTransferFrom(msg.sender, treasury, amountDue);
    }

    /// @notice Approves and transfers ERC20 payment to the treasury using EIP-2612.
    /// @param paymentToken The ERC20 used for payment.
    /// @param amountDue The amount to collect.
    /// @param permit The EIP-2612 permit parameters.
    function _collectPaymentWithPermit(
        address paymentToken,
        uint256 amountDue,
        PermitParams memory permit
    ) internal {
        IERC20Permit(paymentToken).permit(
            msg.sender,
            address(this),
            permit.value,
            permit.deadline,
            permit.v,
            permit.r,
            permit.s
        );

        _collectPayment(paymentToken, amountDue);
    }

    /// @notice Installs resolver records and reverse records for a newly registered name.
    /// @param registration The ENS-style registration request being executed.
    /// @param labelhash The keccak256 hash of `registration.label`.
    /// @param tokenId The registrar token id for `labelhash`.
    function _configureName(
        IETHRegistrarController.Registration calldata registration,
        bytes32 labelhash,
        uint256 tokenId
    ) internal {
        bytes32 node = _makeNode(labelhash);

        ens.setRecord(node, registration.owner, registration.resolver, 0);

        if (registration.data.length > 0) {
            Resolver(registration.resolver).multicallWithNodeCheck(
                node,
                registration.data
            );
        }

        baseRegistrar.transferFrom(address(this), registration.owner, tokenId);

        if (registration.reverseRecord & REVERSE_RECORD_ETHEREUM_BIT != 0) {
            reverseRegistrar.setNameForAddr(
                registration.owner,
                registration.owner,
                registration.resolver,
                string.concat(registration.label, ".goat")
            );
        }
    }

    /// @notice Validates a registration request before commitment or reveal.
    /// @param registration The registration request to validate.
    function _validateRegistration(
        IETHRegistrarController.Registration calldata registration
    ) internal pure {
        if (
            registration.data.length > 0 && registration.resolver == address(0)
        ) {
            revert ResolverRequiredWhenDataSupplied();
        }

        if (
            registration.reverseRecord != 0 &&
            registration.resolver == address(0)
        ) {
            revert ResolverRequiredForReverseRecord();
        }

        if (registration.duration < MIN_REGISTRATION_DURATION) {
            revert DurationTooShort(registration.duration);
        }
    }

    /// @notice Returns the normalized label length using ENS upstream string semantics.
    /// @param label The normalized label without the `.goat` suffix.
    /// @return length The Unicode code-point length calculated by `StringUtils.strlen`.
    function _labelLength(
        string calldata label
    ) internal pure returns (uint256 length) {
        return label.strlen();
    }

    /// @notice Returns the full `.goat` node for `labelhash`.
    /// @param labelhash The keccak256 hash of the normalized label.
    /// @return node The namehash of `<label>.goat`.
    function _makeNode(bytes32 labelhash) internal view returns (bytes32 node) {
        return keccak256(abi.encodePacked(baseNode, labelhash));
    }
}
