// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IETHRegistrarController} from "@ensdomains/ens-contracts/contracts/ethregistrar/IETHRegistrarController.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IEip3009} from "./interfaces/IEip3009.sol";
import {IGNSRegistrarController} from "./interfaces/IGNSRegistrarController.sol";
import {IPermit2} from "./interfaces/IPermit2.sol";
import {IX402Callback} from "./interfaces/IX402Callback.sol";

/// @title GNSX402Adaptor
/// @notice GoatX402 callback target for `.goat` registrations and renewals.
/// @dev
/// - EIP-712 typed data schema MUST match the GoatX402 server's emitted typed data
///   (see `Eip3009CallbackData` / `Permit2CallbackData` in the GoatX402 demo
///   MerchantCallback contract). Any divergence in type name, field name, or
///   field order produces a different typehash and the signature recovery
///   reverts with `InvalidCalldataSignature`.
/// - GNS only supports the `WithCalldata` callback variants because registration
///   and renewal parameters cannot be derived from payment amount alone.
/// - Reverse-record writes are rejected on this path because they would bind
///   reverse ownership to the adaptor instead of the end-user.
contract GNSX402Adaptor is IX402Callback, EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 internal constant ACTION_REGISTER = 1;
    uint8 internal constant ACTION_RENEW = 2;

    /// @dev Typehash MUST match GoatX402 server's emitted Eip3009CallbackData
    ///      schema (field names, order, and the type name itself).
    bytes32 public constant EIP3009_CALLBACK_DATA_TYPEHASH = keccak256(
        "Eip3009CallbackData(address token,address owner,address payer,uint256 amount,bytes32 orderId,uint256 calldataNonce,uint256 deadline,bytes32 calldataHash)"
    );

    /// @dev Typehash MUST match GoatX402 server's emitted Permit2CallbackData
    ///      schema (field names, order, and the type name itself).
    bytes32 public constant PERMIT2_CALLBACK_DATA_TYPEHASH = keccak256(
        "Permit2CallbackData(address permit2,address token,address owner,address payer,uint256 amount,bytes32 orderId,uint256 calldataNonce,uint256 deadline,bytes32 calldataHash)"
    );

    error CallerNotAuthorized();
    error ZeroAuthorizedCaller();
    error UnsupportedSimpleCallback();
    error CalldataDeadlineExpired();
    error CalldataNonceAlreadyUsed();
    error InvalidCalldataSignature();
    error InvalidCallbackAction(uint8 action);
    error ReverseRecordNotSupported(uint8 reverseRecord);
    error PaymentAmountMismatch(uint256 quotedAmount, uint256 paymentAmount);
    error OrderAlreadyProcessed(bytes32 orderId);
    error InvalidPermit2Address();

    event AuthorizedCallerUpdated(address indexed caller, bool authorized);
    event X402PaymentReceived(
        address indexed token,
        address indexed originalPayer,
        uint256 amount,
        string variant
    );
    event CalldataVerified(
        address indexed originalPayer,
        bytes32 indexed orderId,
        uint256 calldataNonce
    );
    event X402RegistrationExecuted(
        bytes32 indexed orderId,
        address indexed payer,
        address indexed owner,
        string label,
        address paymentToken,
        uint256 amount
    );
    event X402RenewalExecuted(
        bytes32 indexed orderId,
        address indexed payer,
        string label,
        address indexed paymentToken,
        uint256 amount,
        uint256 duration
    );

    IGNSRegistrarController public immutable controller;
    address public immutable canonicalPermit2;

    mapping(address => bool) public authorizedCallers;
    mapping(address => mapping(uint256 => bool)) public calldataNonceUsed;
    mapping(bytes32 => bool) public processedOrders;

    constructor(
        IGNSRegistrarController _controller,
        address initialAuthorizedCaller
    ) EIP712("GNS X402 Adaptor", "1") {
        if (initialAuthorizedCaller == address(0)) {
            revert ZeroAuthorizedCaller();
        }

        controller = _controller;
        canonicalPermit2 = address(0);
        authorizedCallers[initialAuthorizedCaller] = true;

        emit AuthorizedCallerUpdated(initialAuthorizedCaller, true);
    }

    function setAuthorizedCaller(
        address caller,
        bool authorized
    ) external onlyOwner {
        if (caller == address(0)) {
            revert ZeroAuthorizedCaller();
        }

        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    function x402SpentEip3009(
        address,
        address,
        address,
        uint256,
        uint256,
        uint256,
        bytes32,
        uint8,
        bytes32,
        bytes32
    ) external pure override {
        revert UnsupportedSimpleCallback();
    }

    function x402SpentPermit2(
        address,
        address,
        address,
        address,
        uint256,
        uint256,
        uint256,
        bytes calldata
    ) external pure override {
        revert UnsupportedSimpleCallback();
    }

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
    ) external override nonReentrant {
        _requireAuthorizedCaller();
        _verifyEip3009CalldataSignature(
            token,
            originalPayer,
            owner,
            amount,
            calldata_,
            orderId,
            calldataNonce,
            calldataDeadline,
            calldataV,
            calldataR,
            calldataS
        );

        IEip3009(token).receiveWithAuthorization(
            owner,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );

        emit X402PaymentReceived(
            token,
            originalPayer,
            amount,
            "eip3009+calldata"
        );

        _processOrder(token, originalPayer, amount, calldata_, orderId);
    }

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
    ) external override nonReentrant {
        _handlePermit2WithCalldata(
            permit2,
            token,
            originalPayer,
            owner,
            amount,
            nonce,
            deadline,
            signature,
            calldata_,
            orderId,
            calldataNonce,
            calldataDeadline,
            calldataV,
            calldataR,
            calldataS
        );
    }

    function recoverERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    function _processOrder(
        address token,
        address originalPayer,
        uint256 amount,
        bytes memory calldata_,
        bytes32 orderId
    ) internal {
        if (processedOrders[orderId]) {
            revert OrderAlreadyProcessed(orderId);
        }
        processedOrders[orderId] = true;

        (
            uint8 action,
            string memory label,
            address registrationOwner,
            uint256 duration,
            bytes32 secret,
            address resolver,
            uint8 reverseRecord,
            bytes32 referrer
        ) = abi.decode(
                calldata_,
                (
                    uint8,
                    string,
                    address,
                    uint256,
                    bytes32,
                    address,
                    uint8,
                    bytes32
                )
            );

        if (reverseRecord != 0) {
            revert ReverseRecordNotSupported(reverseRecord);
        }

        IGNSRegistrarController.PaymentRequest
            memory payment = IGNSRegistrarController.PaymentRequest({
                paymentToken: token,
                maxPaymentAmount: amount
            });

        if (action == ACTION_REGISTER) {
            uint256 amountDue = controller.rentPrice(label, token, duration);
            if (amount != amountDue) {
                revert PaymentAmountMismatch(amountDue, amount);
            }

            IETHRegistrarController.Registration
                memory registration = IETHRegistrarController.Registration({
                    label: label,
                    owner: registrationOwner,
                    duration: duration,
                    secret: secret,
                    resolver: resolver,
                    data: new bytes[](0),
                    reverseRecord: reverseRecord,
                    referrer: referrer
                });

            _approveController(token, amountDue);
            controller.register(registration, payment);
            _clearControllerApproval(token);

            emit X402RegistrationExecuted(
                orderId,
                originalPayer,
                registrationOwner,
                label,
                token,
                amountDue
            );
            return;
        }

        if (action == ACTION_RENEW) {
            uint256 amountDue = controller.rentPrice(label, token, duration);
            if (amount != amountDue) {
                revert PaymentAmountMismatch(amountDue, amount);
            }

            _approveController(token, amountDue);
            controller.renew(label, payment, duration);
            _clearControllerApproval(token);

            emit X402RenewalExecuted(
                orderId,
                originalPayer,
                label,
                token,
                amountDue,
                duration
            );
            return;
        }

        revert InvalidCallbackAction(action);
    }

    function _verifyEip3009CalldataSignature(
        address token,
        address originalPayer,
        address owner,
        uint256 amount,
        bytes memory calldata_,
        bytes32 orderId,
        uint256 calldataNonce,
        uint256 calldataDeadline,
        uint8 calldataV,
        bytes32 calldataR,
        bytes32 calldataS
    ) internal {
        if (block.timestamp > calldataDeadline) {
            revert CalldataDeadlineExpired();
        }
        if (calldataNonceUsed[originalPayer][calldataNonce]) {
            revert CalldataNonceAlreadyUsed();
        }

        // Field order MUST match Eip3009CallbackData typehash exactly.
        bytes32 structHash = keccak256(
            abi.encode(
                EIP3009_CALLBACK_DATA_TYPEHASH,
                token,
                owner,                 // typehash field "owner" (= TSS)
                originalPayer,         // typehash field "payer" (= user)
                amount,
                orderId,
                calldataNonce,
                calldataDeadline,      // typehash field "deadline"
                keccak256(calldata_)
            )
        );

        address signer = ECDSA.recover(
            _hashTypedDataV4(structHash),
            calldataV,
            calldataR,
            calldataS
        );
        if (signer != originalPayer) {
            revert InvalidCalldataSignature();
        }

        calldataNonceUsed[originalPayer][calldataNonce] = true;
        emit CalldataVerified(originalPayer, orderId, calldataNonce);
    }

    function _verifyPermit2CalldataSignature(
        address permit2,
        address token,
        address originalPayer,
        address owner,
        uint256 amount,
        bytes memory calldata_,
        bytes32 orderId,
        uint256 calldataNonce,
        uint256 calldataDeadline,
        uint8 calldataV,
        bytes32 calldataR,
        bytes32 calldataS
    ) internal {
        if (block.timestamp > calldataDeadline) {
            revert CalldataDeadlineExpired();
        }
        if (calldataNonceUsed[originalPayer][calldataNonce]) {
            revert CalldataNonceAlreadyUsed();
        }

        // Field order MUST match Permit2CallbackData typehash exactly.
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT2_CALLBACK_DATA_TYPEHASH,
                permit2,
                token,
                owner,                 // typehash field "owner" (= TSS)
                originalPayer,         // typehash field "payer" (= user)
                amount,
                orderId,
                calldataNonce,
                calldataDeadline,      // typehash field "deadline"
                keccak256(calldata_)
            )
        );

        address signer = ECDSA.recover(
            _hashTypedDataV4(structHash),
            calldataV,
            calldataR,
            calldataS
        );
        if (signer != originalPayer) {
            revert InvalidCalldataSignature();
        }

        calldataNonceUsed[originalPayer][calldataNonce] = true;
        emit CalldataVerified(originalPayer, orderId, calldataNonce);
    }

    function _handlePermit2WithCalldata(
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
    ) internal {
        _requireAuthorizedCaller();
        if (canonicalPermit2 != address(0) && permit2 != canonicalPermit2) {
            revert InvalidPermit2Address();
        }

        _verifyPermit2CalldataSignature(
            permit2,
            token,
            originalPayer,
            owner,
            amount,
            calldata_,
            orderId,
            calldataNonce,
            calldataDeadline,
            calldataV,
            calldataR,
            calldataS
        );

        IPermit2(permit2).permitTransferFrom(
            IPermit2.PermitTransferFrom({
                permitted: IPermit2.TokenPermissions({
                    token: token,
                    amount: amount
                }),
                nonce: nonce,
                deadline: deadline
            }),
            IPermit2.SignatureTransferDetails({
                to: address(this),
                requestedAmount: amount
            }),
            owner,
            signature
        );

        emit X402PaymentReceived(
            token,
            originalPayer,
            amount,
            "permit2+calldata"
        );

        _processOrder(token, originalPayer, amount, calldata_, orderId);
    }

    function _requireAuthorizedCaller() internal view {
        if (!authorizedCallers[msg.sender]) {
            revert CallerNotAuthorized();
        }
    }

    function _approveController(
        address paymentToken,
        uint256 amountDue
    ) internal {
        IERC20 token = IERC20(paymentToken);
        token.safeApprove(address(controller), 0);
        token.safeApprove(address(controller), amountDue);
    }

    function _clearControllerApproval(address paymentToken) internal {
        IERC20(paymentToken).safeApprove(address(controller), 0);
    }
}
