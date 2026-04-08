import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbiParameters,
  parseSignature,
  parseUnits,
  zeroHash as ZERO_HASH,
  zeroAddress,
  type Address,
} from "viem";
import { labelhash, namehash, normalize } from "viem/ens";

import GNSModule from "../ignition/modules/GNS.js";

function assertAddress(actual: string, expected: string) {
  assert.equal(actual.toLowerCase(), expected.toLowerCase());
}

function toTokenId(label: string) {
  return BigInt(labelhash(label));
}

const YEAR = 365n * 24n * 60n * 60n;
const PARENT_CANNOT_CONTROL = 1n << 16n;
const CANNOT_UNWRAP = 1n;
const GOAT_NODE = namehash("goat");
const REVERSE_RECORD_ETHEREUM = 1;
const X402_PAYLOAD_ABI = parseAbiParameters(
  "uint8 action, string label, address owner, uint256 duration, bytes32 secret, address resolver, uint8 reverseRecord, bytes32 referrer",
);
const EIP3009_CALLDATA_TYPES = {
  Eip3009Calldata: [
    { name: "token", type: "address" },
    { name: "originalPayer", type: "address" },
    { name: "owner", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "calldataHash", type: "bytes32" },
    { name: "orderId", type: "bytes32" },
    { name: "calldataNonce", type: "uint256" },
    { name: "calldataDeadline", type: "uint256" },
  ],
} as const;
const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

describe(".goat GNS", async function () {
  const { ignition, networkHelpers, viem: hhViem } = await network.connect();
  const sharedPublicClient = await hhViem.getPublicClient();

  type MakeCommitmentArgs = Parameters<
    Awaited<
      ReturnType<typeof deployFixture>
    >["userController"]["read"]["makeCommitment"]
  >[0];

  async function commitRequest(
    controller: Awaited<ReturnType<typeof deployFixture>>["userController"],
    registration: MakeCommitmentArgs[0],
    payment: MakeCommitmentArgs[1],
    networkHelpers: Awaited<ReturnType<typeof deployFixture>>["networkHelpers"],
  ) {
    const commitment = await controller.read.makeCommitment([
      registration,
      payment,
    ]);
    await controller.write.commit([commitment]);
    await networkHelpers.time.increase(61);
    return commitment;
  }

  async function deployFixture() {
    const [owner, user, other] = await hhViem.getWalletClients();
    const chainId = await sharedPublicClient.getChainId();

    const deployment = await ignition.deploy(GNSModule, {
      deploymentId: "gns-fixture",
    });

    const paymentToken = await hhViem.deployContract("MockERC20PermitToken", [
      "Goat Dollar",
      "GUSD",
    ]);
    const altToken = await hhViem.deployContract("MockERC20PermitToken", [
      "Alt Dollar",
      "AUSD",
    ]);
    const unsupportedToken = await hhViem.deployContract(
      "MockERC20PermitToken",
      ["Unsupported Dollar", "UUSD"],
    );

    const annualPrice3 = parseUnits("100", 18);
    const annualPrice4 = parseUnits("30", 18);
    const annualPrice5Plus = parseUnits("3", 18);
    const altAnnualPrice3 = parseUnits("250", 18);
    const altAnnualPrice4 = parseUnits("80", 18);
    const altAnnualPrice5Plus = parseUnits("8", 18);

    await deployment.gnsPriceBook.write.setTokenConfig([
      paymentToken.address,
      annualPrice3,
      annualPrice4,
      annualPrice5Plus,
    ]);
    await deployment.gnsPriceBook.write.setTokenConfig([
      altToken.address,
      altAnnualPrice3,
      altAnnualPrice4,
      altAnnualPrice5Plus,
    ]);

    const userMint = parseUnits("1000", 18);
    await paymentToken.write.mint([user.account.address, userMint]);
    await altToken.write.mint([user.account.address, userMint]);
    await unsupportedToken.write.mint([user.account.address, userMint]);

    const userController = await hhViem.getContractAt(
      "GNSRegistrarController",
      deployment.gnsRegistrarController.address,
      { client: { wallet: user } },
    );
    const ownerX402Adaptor = await hhViem.getContractAt(
      "GNSX402Adaptor",
      deployment.gnsX402Adaptor.address,
      { client: { wallet: owner } },
    );
    const otherX402Adaptor = await hhViem.getContractAt(
      "GNSX402Adaptor",
      deployment.gnsX402Adaptor.address,
      { client: { wallet: other } },
    );
    const otherController = await hhViem.getContractAt(
      "GNSRegistrarController",
      deployment.gnsRegistrarController.address,
      { client: { wallet: other } },
    );
    const userBaseRegistrar = await hhViem.getContractAt(
      "BaseRegistrarImplementation",
      deployment.baseRegistrar.address,
      { client: { wallet: user } },
    );
    const userGoatNameWrapper = await hhViem.getContractAt(
      "GoatNameWrapper",
      deployment.goatNameWrapper.address,
      { client: { wallet: user } },
    );
    const userPublicResolver = await hhViem.getContractAt(
      "PublicResolver",
      deployment.publicResolver.address,
      { client: { wallet: user } },
    );
    const userPaymentToken = await hhViem.getContractAt(
      "MockERC20PermitToken",
      paymentToken.address,
      { client: { wallet: user } },
    );

    return {
      ...deployment,
      networkHelpers: networkHelpers,
      viem: hhViem,
      publicClient: sharedPublicClient,
      chainId,
      owner,
      user,
      other,
      paymentToken,
      altToken,
      unsupportedToken,
      userController,
      ownerX402Adaptor,
      otherX402Adaptor,
      otherController,
      userBaseRegistrar,
      userGoatNameWrapper,
      userPublicResolver,
      userPaymentToken,
      annualPrice3,
      annualPrice4,
      annualPrice5Plus,
      altAnnualPrice3,
      altAnnualPrice4,
      altAnnualPrice5Plus,
    };
  }

  async function signPermit(
    token: {
      address: Address;
      read: {
        nonces(args: readonly [Address]): Promise<bigint>;
        name(): Promise<string>;
      };
    },
    ownerWallet: { account: { address: Address }; signTypedData: Function },
    spender: Address,
    value: bigint,
    chainId: number,
    deadline: bigint,
  ) {
    const nonce = await token.read.nonces([ownerWallet.account.address]);
    const tokenName = await token.read.name();
    const signatureHex = await ownerWallet.signTypedData({
      account: ownerWallet.account,
      domain: {
        chainId,
        name: tokenName,
        verifyingContract: token.address,
        version: "1",
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: ownerWallet.account.address,
        spender,
        value,
        nonce,
        deadline,
      },
    });
    const { r, s, yParity } = parseSignature(signatureHex);
    return {
      deadline,
      r,
      s,
      v: yParity + 27,
      value,
    };
  }

  function encodeX402Payload(args: {
    action: number;
    label: string;
    owner: Address;
    duration: bigint;
    secret?: `0x${string}`;
    resolver?: Address;
    reverseRecord?: number;
    referrer?: `0x${string}`;
  }) {
    return encodeAbiParameters(X402_PAYLOAD_ABI, [
      args.action,
      args.label,
      args.owner,
      args.duration,
      args.secret ??
        ("0x0000000000000000000000000000000000000000000000000000000000000000" as const),
      args.resolver ?? zeroAddress,
      args.reverseRecord ?? 0,
      args.referrer ?? ZERO_HASH,
    ]);
  }

  async function signReceiveWithAuthorization(
    token: Awaited<ReturnType<typeof deployFixture>>["userPaymentToken"],
    ownerWallet: Awaited<ReturnType<typeof deployFixture>>["user"],
    to: Address,
    value: bigint,
    chainId: number,
    validAfter: bigint,
    validBefore: bigint,
    nonce: `0x${string}`,
  ) {
    const tokenName = await token.read.name();
    const signatureHex = await ownerWallet.signTypedData({
      account: ownerWallet.account,
      domain: {
        chainId,
        name: tokenName,
        verifyingContract: token.address,
        version: "1",
      },
      types: RECEIVE_WITH_AUTHORIZATION_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: ownerWallet.account.address,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      },
    });
    const { r, s, yParity } = parseSignature(signatureHex);
    return {
      r,
      s,
      v: yParity + 27,
    };
  }

  async function signX402Eip3009Calldata(
    adaptor: Awaited<ReturnType<typeof deployFixture>>["ownerX402Adaptor"],
    payerWallet: Awaited<ReturnType<typeof deployFixture>>["user"],
    chainId: number,
    args: {
      token: Address;
      owner: Address;
      amount: bigint;
      calldata: `0x${string}`;
      orderId: `0x${string}`;
      calldataNonce: bigint;
      calldataDeadline: bigint;
    },
  ) {
    const signatureHex = await payerWallet.signTypedData({
      account: payerWallet.account,
      domain: {
        chainId,
        name: "GNS X402 Adaptor",
        verifyingContract: adaptor.address,
        version: "1",
      },
      types: EIP3009_CALLDATA_TYPES,
      primaryType: "Eip3009Calldata",
      message: {
        token: args.token,
        originalPayer: payerWallet.account.address,
        owner: args.owner,
        amount: args.amount,
        calldataHash: keccak256(args.calldata),
        orderId: args.orderId,
        calldataNonce: args.calldataNonce,
        calldataDeadline: args.calldataDeadline,
      },
    });
    const { r, s, yParity } = parseSignature(signatureHex);
    return {
      r,
      s,
      v: yParity + 27,
    };
  }

  it("deploys the ENS-compatible stack and configures resolver interfaces", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    assertAddress(
      await fixture.ensRegistry.read.owner([GOAT_NODE]),
      fixture.baseRegistrar.address,
    );
    assertAddress(
      await fixture.ensRegistry.read.owner([namehash("reverse")]),
      fixture.owner.account.address,
    );
    assertAddress(
      await fixture.ensRegistry.read.owner([namehash("addr.reverse")]),
      fixture.reverseRegistrar.address,
    );
    assertAddress(
      await fixture.reverseRegistrar.read.defaultResolver(),
      fixture.publicResolver.address,
    );

    assert.equal(
      await fixture.baseRegistrar.read.controllers([
        fixture.goatNameWrapper.address,
      ]),
      true,
    );
    assert.equal(
      await fixture.baseRegistrar.read.controllers([
        fixture.gnsRegistrarController.address,
      ]),
      true,
    );
    assert.equal(
      await fixture.reverseRegistrar.read.controllers([
        fixture.gnsRegistrarController.address,
      ]),
      true,
    );

    const controllerInterfaceId =
      await fixture.gnsRegistrarController.read.interfaceId();
    const wrapperInterfaceId = await fixture.goatNameWrapper.read.interfaceId();

    assertAddress(
      await fixture.publicResolver.read.interfaceImplementer([
        GOAT_NODE,
        controllerInterfaceId,
      ]),
      fixture.gnsRegistrarController.address,
    );
    assertAddress(
      await fixture.publicResolver.read.interfaceImplementer([
        GOAT_NODE,
        wrapperInterfaceId,
      ]),
      fixture.goatNameWrapper.address,
    );
  });

  it("quotes independent per-token price buckets and registers unwrapped names with ERC20 allowance", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    assert.equal(
      await fixture.userController.read.rentPrice([
        normalize("cat"),
        fixture.paymentToken.address,
        YEAR,
      ]),
      fixture.annualPrice3,
    );
    assert.equal(
      await fixture.userController.read.rentPrice([
        normalize("moon"),
        fixture.paymentToken.address,
        YEAR,
      ]),
      fixture.annualPrice4,
    );
    assert.equal(
      await fixture.userController.read.rentPrice([
        normalize("planet"),
        fixture.paymentToken.address,
        YEAR,
      ]),
      fixture.annualPrice5Plus,
    );
    assert.equal(
      await fixture.userController.read.rentPrice([
        normalize("moon"),
        fixture.altToken.address,
        YEAR,
      ]),
      fixture.altAnnualPrice4,
    );

    const label = normalize("moon");
    const quotedPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const request = {
      data: [] as `0x${string}`[],
      duration: YEAR,
      label,
      owner: fixture.user.account.address,
      referrer: ZERO_HASH,
      resolver: zeroAddress,
      reverseRecord: 0,
      secret:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
    };
    const payment = {
      maxPaymentAmount: quotedPrice,
      paymentToken: fixture.paymentToken.address,
    };

    await fixture.userPaymentToken.write.approve([
      fixture.gnsRegistrarController.address,
      quotedPrice,
    ]);
    await commitRequest(
      fixture.userController,
      request,
      payment,
      fixture.networkHelpers,
    );
    await fixture.userController.write.register([request, payment]);

    const tokenId = toTokenId(label);
    assertAddress(
      await fixture.baseRegistrar.read.ownerOf([tokenId]),
      fixture.user.account.address,
    );
    assertAddress(
      await fixture.ensRegistry.read.owner([namehash(`${label}.goat`)]),
      fixture.user.account.address,
    );
    assert.equal(await fixture.userController.read.available([label]), false);
    assert.equal(
      await fixture.paymentToken.read.balanceOf([
        fixture.owner.account.address,
      ]),
      quotedPrice,
    );
  });

  it("rejects non-ERC20 payment token configuration", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    await hhViem.assertions.revertWithCustomError(
      fixture.gnsPriceBook.write.setTokenConfig([
        fixture.owner.account.address,
        1n,
        1n,
        1n,
      ]),
      fixture.gnsPriceBook,
      "InvalidPaymentToken",
    );
  });

  it("rejects unsupported or invalid labels and enforces commitment windows and max payment", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    assert.equal(
      await fixture.userController.read.available([normalize("go")]),
      false,
    );

    assert.equal(
      await fixture.userController.read.rentPrice([
        "x".repeat(64),
        fixture.paymentToken.address,
        YEAR,
      ]),
      fixture.annualPrice5Plus,
    );

    await hhViem.assertions.revertWithCustomError(
      fixture.userController.read.rentPrice([
        normalize("valid"),
        fixture.unsupportedToken.address,
        YEAR,
      ]),
      fixture.gnsPriceBook,
      "UnsupportedPaymentToken",
    );

    const label = normalize("timed");
    const price = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const request = {
      data: [] as `0x${string}`[],
      duration: YEAR,
      label,
      owner: fixture.user.account.address,
      referrer: ZERO_HASH,
      resolver: "0x0000000000000000000000000000000000000000" as Address,
      reverseRecord: 0,
      secret:
        "0x2222222222222222222222222222222222222222222222222222222222222222" as const,
    };
    const payment = {
      maxPaymentAmount: price,
      paymentToken: fixture.paymentToken.address,
    };
    const commitment = await fixture.userController.read.makeCommitment([
      request,
      payment,
    ]);

    await fixture.userController.write.commit([commitment]);

    await hhViem.assertions.revertWithCustomError(
      fixture.userController.write.register([request, payment]),
      fixture.gnsRegistrarController,
      "CommitmentTooNew",
    );

    await hhViem.assertions.revertWithCustomError(
      fixture.userController.write.commit([commitment]),
      fixture.gnsRegistrarController,
      "UnexpiredCommitmentExists",
    );

    await fixture.networkHelpers.time.increase(86_401);

    await hhViem.assertions.revertWithCustomError(
      fixture.userController.write.register([request, payment]),
      fixture.gnsRegistrarController,
      "CommitmentTooOld",
    );

    const expensiveLabel = normalize("cow");
    const expensivePrice = await fixture.userController.read.rentPrice([
      expensiveLabel,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const cappedRequest = {
      ...request,
      label: expensiveLabel,
      secret:
        "0x3333333333333333333333333333333333333333333333333333333333333333" as const,
    };
    const cappedPayment = {
      maxPaymentAmount: expensivePrice - 1n,
      paymentToken: fixture.paymentToken.address,
    };

    await fixture.userPaymentToken.write.approve([
      fixture.gnsRegistrarController.address,
      expensivePrice,
    ]);
    await commitRequest(
      fixture.userController,
      cappedRequest,
      cappedPayment,
      fixture.networkHelpers,
    );

    await hhViem.assertions.revertWithCustomError(
      fixture.userController.write.register([cappedRequest, cappedPayment]),
      fixture.gnsRegistrarController,
      "MaxPaymentExceeded",
    );
  });

  it("sets resolver records and reverse records during registration", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    const label = normalize("alpha");
    const node = namehash(`${label}.goat`);
    const quotedPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const resolverCalls = [
      encodeFunctionData({
        abi: fixture.publicResolver.abi,
        functionName: "setAddr",
        args: [node, fixture.user.account.address],
      }),
      encodeFunctionData({
        abi: fixture.publicResolver.abi,
        functionName: "setText",
        args: [node, "url", "https://alpha.goat"],
      }),
    ];

    const request = {
      data: resolverCalls,
      duration: YEAR,
      label,
      owner: fixture.user.account.address,
      referrer: ZERO_HASH,
      resolver: fixture.publicResolver.address,
      reverseRecord: REVERSE_RECORD_ETHEREUM,
      secret:
        "0x4444444444444444444444444444444444444444444444444444444444444444" as const,
    };
    const payment = {
      maxPaymentAmount: quotedPrice,
      paymentToken: fixture.paymentToken.address,
    };

    await fixture.userPaymentToken.write.approve([
      fixture.gnsRegistrarController.address,
      quotedPrice,
    ]);
    await commitRequest(
      fixture.userController,
      request,
      payment,
      fixture.networkHelpers,
    );
    await fixture.userController.write.register([request, payment]);

    assertAddress(
      await fixture.ensRegistry.read.resolver([node]),
      fixture.publicResolver.address,
    );
    assertAddress(
      await fixture.publicResolver.read.addr([node]),
      fixture.user.account.address,
    );
    assert.equal(
      await fixture.publicResolver.read.text([node, "url"]),
      "https://alpha.goat",
    );

    const reverseNode = await fixture.reverseRegistrar.read.node([
      fixture.user.account.address,
    ]);
    assert.equal(
      await fixture.publicResolver.read.name([reverseNode]),
      "alpha.goat",
    );
  });

  it("writes reverse records for the caller instead of registration.owner", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    const label = normalize("broker");
    const quotedPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const request = {
      data: [] as `0x${string}`[],
      duration: YEAR,
      label,
      owner: fixture.other.account.address,
      referrer: ZERO_HASH,
      resolver: fixture.publicResolver.address,
      reverseRecord: REVERSE_RECORD_ETHEREUM,
      secret:
        "0x4545454545454545454545454545454545454545454545454545454545454545" as const,
    };
    const payment = {
      maxPaymentAmount: quotedPrice,
      paymentToken: fixture.paymentToken.address,
    };

    await fixture.userPaymentToken.write.approve([
      fixture.gnsRegistrarController.address,
      quotedPrice,
    ]);
    await commitRequest(
      fixture.userController,
      request,
      payment,
      fixture.networkHelpers,
    );
    await fixture.userController.write.register([request, payment]);

    assertAddress(
      await fixture.baseRegistrar.read.ownerOf([toTokenId(label)]),
      fixture.other.account.address,
    );

    const reverseNode = await fixture.reverseRegistrar.read.node([
      fixture.user.account.address,
    ]);
    assert.equal(
      await fixture.publicResolver.read.name([reverseNode]),
      "broker.goat",
    );
  });

  it("supports registration and renewal through EIP-2612 permits", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    const label = normalize("delta");
    const quotedPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const request = {
      data: [] as `0x${string}`[],
      duration: YEAR,
      label,
      owner: fixture.user.account.address,
      referrer: ZERO_HASH,
      resolver: "0x0000000000000000000000000000000000000000" as Address,
      reverseRecord: 0,
      secret:
        "0x5555555555555555555555555555555555555555555555555555555555555555" as const,
    };
    const payment = {
      maxPaymentAmount: quotedPrice,
      paymentToken: fixture.paymentToken.address,
    };

    await commitRequest(
      fixture.userController,
      request,
      payment,
      fixture.networkHelpers,
    );
    const registerPermit = await signPermit(
      fixture.userPaymentToken,
      fixture.user,
      fixture.gnsRegistrarController.address,
      quotedPrice,
      fixture.chainId,
      BigInt(await fixture.networkHelpers.time.latest()) + 3600n,
    );
    await fixture.userController.write.registerWithPermit([
      request,
      payment,
      registerPermit,
    ]);

    const tokenId = toTokenId(label);
    const initialExpiry = await fixture.baseRegistrar.read.nameExpires([
      tokenId,
    ]);
    assertAddress(
      await fixture.baseRegistrar.read.ownerOf([tokenId]),
      fixture.user.account.address,
    );

    const renewPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const renewPayment = {
      maxPaymentAmount: renewPrice,
      paymentToken: fixture.paymentToken.address,
    };
    const renewPermit = await signPermit(
      fixture.userPaymentToken,
      fixture.user,
      fixture.gnsRegistrarController.address,
      renewPrice,
      fixture.chainId,
      BigInt(await fixture.networkHelpers.time.latest()) + 3600n,
    );
    await fixture.userController.write.renewWithPermit([
      label,
      renewPayment,
      YEAR,
      renewPermit,
    ]);

    const renewedExpiry = await fixture.baseRegistrar.read.nameExpires([
      tokenId,
    ]);
    assert.ok(renewedExpiry > initialExpiry);
    assert.equal(
      await fixture.paymentToken.read.balanceOf([
        fixture.owner.account.address,
      ]),
      quotedPrice + renewPrice,
    );
  });

  it("processes x402 EIP-3009 callbacks into exact-price registrations and renewals", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    const label = normalize("xpay");
    const quotedPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const request = {
      data: [] as `0x${string}`[],
      duration: YEAR,
      label,
      owner: fixture.user.account.address,
      referrer: ZERO_HASH,
      resolver: zeroAddress,
      reverseRecord: 0,
      secret:
        "0x8888888888888888888888888888888888888888888888888888888888888888" as const,
    };
    const payment = {
      maxPaymentAmount: quotedPrice,
      paymentToken: fixture.paymentToken.address,
    };

    await commitRequest(
      fixture.userController,
      request,
      payment,
      fixture.networkHelpers,
    );

    const registrationCalldata = encodeX402Payload({
      action: 1,
      label,
      owner: fixture.user.account.address,
      duration: YEAR,
      secret: request.secret,
    });
    const registrationOrderId =
      "0x1010101010101010101010101010101010101010101010101010101010101010";
    const registrationAuthNonce =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    const registrationCalldataDeadline = 4_102_444_800n;
    const registrationAuthSignature = await signReceiveWithAuthorization(
      fixture.userPaymentToken,
      fixture.user,
      fixture.ownerX402Adaptor.address,
      quotedPrice,
      fixture.chainId,
      0n,
      registrationCalldataDeadline,
      registrationAuthNonce,
    );
    const registrationCalldataSignature = await signX402Eip3009Calldata(
      fixture.ownerX402Adaptor,
      fixture.user,
      fixture.chainId,
      {
        token: fixture.paymentToken.address,
        owner: fixture.user.account.address,
        amount: quotedPrice,
        calldata: registrationCalldata,
        orderId: registrationOrderId,
        calldataNonce: 1n,
        calldataDeadline: registrationCalldataDeadline,
      },
    );
    await fixture.ownerX402Adaptor.write.x402SpentEip3009WithCalldata([
      fixture.paymentToken.address,
      fixture.user.account.address,
      fixture.user.account.address,
      quotedPrice,
      0n,
      registrationCalldataDeadline,
      registrationAuthNonce,
      registrationAuthSignature.v,
      registrationAuthSignature.r,
      registrationAuthSignature.s,
      registrationCalldata,
      registrationOrderId,
      1n,
      registrationCalldataDeadline,
      registrationCalldataSignature.v,
      registrationCalldataSignature.r,
      registrationCalldataSignature.s,
    ]);

    const tokenId = toTokenId(label);
    const initialExpiry = await fixture.baseRegistrar.read.nameExpires([
      tokenId,
    ]);
    assertAddress(
      await fixture.baseRegistrar.read.ownerOf([tokenId]),
      fixture.user.account.address,
    );
    assert.equal(
      await fixture.paymentToken.read.balanceOf([
        fixture.owner.account.address,
      ]),
      quotedPrice,
    );

    const renewPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const renewalCalldata = encodeX402Payload({
      action: 2,
      label,
      owner: fixture.user.account.address,
      duration: YEAR,
    });
    const renewalOrderId =
      "0x2020202020202020202020202020202020202020202020202020202020202020";
    const renewalAuthNonce =
      "0x2121212121212121212121212121212121212121212121212121212121212121";
    const renewalCalldataDeadline = 4_102_444_800n;
    const renewalAuthSignature = await signReceiveWithAuthorization(
      fixture.userPaymentToken,
      fixture.user,
      fixture.ownerX402Adaptor.address,
      renewPrice,
      fixture.chainId,
      0n,
      renewalCalldataDeadline,
      renewalAuthNonce,
    );
    const renewalCalldataSignature = await signX402Eip3009Calldata(
      fixture.ownerX402Adaptor,
      fixture.user,
      fixture.chainId,
      {
        token: fixture.paymentToken.address,
        owner: fixture.user.account.address,
        amount: renewPrice,
        calldata: renewalCalldata,
        orderId: renewalOrderId,
        calldataNonce: 2n,
        calldataDeadline: renewalCalldataDeadline,
      },
    );
    await fixture.ownerX402Adaptor.write.x402SpentEip3009WithCalldata([
      fixture.paymentToken.address,
      fixture.user.account.address,
      fixture.user.account.address,
      renewPrice,
      0n,
      renewalCalldataDeadline,
      renewalAuthNonce,
      renewalAuthSignature.v,
      renewalAuthSignature.r,
      renewalAuthSignature.s,
      renewalCalldata,
      renewalOrderId,
      2n,
      renewalCalldataDeadline,
      renewalCalldataSignature.v,
      renewalCalldataSignature.r,
      renewalCalldataSignature.s,
    ]);

    const renewedExpiry = await fixture.baseRegistrar.read.nameExpires([
      tokenId,
    ]);
    assert.ok(renewedExpiry > initialExpiry);
    assert.equal(
      await fixture.paymentToken.read.balanceOf([
        fixture.owner.account.address,
      ]),
      quotedPrice + renewPrice,
    );
  });

  it("rejects unsupported callback usage and prevents x402 replay", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    const label = normalize("relay");
    const quotedPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const request = {
      data: [] as `0x${string}`[],
      duration: YEAR,
      label,
      owner: fixture.user.account.address,
      referrer: ZERO_HASH,
      resolver: fixture.publicResolver.address,
      reverseRecord: REVERSE_RECORD_ETHEREUM,
      secret:
        "0x9090909090909090909090909090909090909090909090909090909090909090" as const,
    };
    const reverseRecordCalldata = encodeX402Payload({
      action: 1,
      label,
      owner: fixture.user.account.address,
      duration: YEAR,
      secret: request.secret,
      resolver: fixture.publicResolver.address,
      reverseRecord: REVERSE_RECORD_ETHEREUM,
    });
    const reverseRecordOrderId =
      "0x4040404040404040404040404040404040404040404040404040404040404040";
    const reverseRecordNonce =
      "0x4141414141414141414141414141414141414141414141414141414141414141";
    const deadline = 4_102_444_800n;
    const reverseRecordAuthSignature = await signReceiveWithAuthorization(
      fixture.userPaymentToken,
      fixture.user,
      fixture.ownerX402Adaptor.address,
      quotedPrice,
      fixture.chainId,
      0n,
      deadline,
      reverseRecordNonce,
    );
    const reverseRecordCalldataSignature = await signX402Eip3009Calldata(
      fixture.ownerX402Adaptor,
      fixture.user,
      fixture.chainId,
      {
        token: fixture.paymentToken.address,
        owner: fixture.user.account.address,
        amount: quotedPrice,
        calldata: reverseRecordCalldata,
        orderId: reverseRecordOrderId,
        calldataNonce: 3n,
        calldataDeadline: deadline,
      },
    );

    await hhViem.assertions.revertWithCustomError(
      fixture.ownerX402Adaptor.write.x402SpentEip3009([
        fixture.paymentToken.address,
        fixture.user.account.address,
        fixture.user.account.address,
        quotedPrice,
        0n,
        deadline,
        reverseRecordNonce,
        reverseRecordAuthSignature.v,
        reverseRecordAuthSignature.r,
        reverseRecordAuthSignature.s,
      ]),
      fixture.ownerX402Adaptor,
      "UnsupportedSimpleCallback",
    );

    await hhViem.assertions.revertWithCustomError(
      fixture.otherX402Adaptor.write.x402SpentEip3009WithCalldata([
        fixture.paymentToken.address,
        fixture.user.account.address,
        fixture.user.account.address,
        quotedPrice,
        0n,
        deadline,
        reverseRecordNonce,
        reverseRecordAuthSignature.v,
        reverseRecordAuthSignature.r,
        reverseRecordAuthSignature.s,
        reverseRecordCalldata,
        reverseRecordOrderId,
        3n,
        deadline,
        reverseRecordCalldataSignature.v,
        reverseRecordCalldataSignature.r,
        reverseRecordCalldataSignature.s,
      ]),
      fixture.ownerX402Adaptor,
      "CallerNotAuthorized",
    );

    await hhViem.assertions.revertWithCustomError(
      fixture.ownerX402Adaptor.write.x402SpentEip3009WithCalldata([
        fixture.paymentToken.address,
        fixture.user.account.address,
        fixture.user.account.address,
        quotedPrice,
        0n,
        deadline,
        reverseRecordNonce,
        reverseRecordAuthSignature.v,
        reverseRecordAuthSignature.r,
        reverseRecordAuthSignature.s,
        reverseRecordCalldata,
        reverseRecordOrderId,
        3n,
        deadline,
        reverseRecordCalldataSignature.v,
        reverseRecordCalldataSignature.r,
        reverseRecordCalldataSignature.s,
      ]),
      fixture.ownerX402Adaptor,
      "ReverseRecordNotSupported",
    );

    const validRequest = {
      ...request,
      resolver: zeroAddress,
      reverseRecord: 0,
    };
    await commitRequest(
      fixture.userController,
      validRequest,
      {
        maxPaymentAmount: quotedPrice,
        paymentToken: fixture.paymentToken.address,
      },
      fixture.networkHelpers,
    );

    const validCalldata = encodeX402Payload({
      action: 1,
      label,
      owner: fixture.user.account.address,
      duration: YEAR,
      secret: validRequest.secret,
    });
    const firstOrderId =
      "0x5050505050505050505050505050505050505050505050505050505050505050";
    const firstAuthNonce =
      "0x5151515151515151515151515151515151515151515151515151515151515151";
    const firstAuthSignature = await signReceiveWithAuthorization(
      fixture.userPaymentToken,
      fixture.user,
      fixture.ownerX402Adaptor.address,
      quotedPrice,
      fixture.chainId,
      0n,
      deadline,
      firstAuthNonce,
    );
    const firstCalldataSignature = await signX402Eip3009Calldata(
      fixture.ownerX402Adaptor,
      fixture.user,
      fixture.chainId,
      {
        token: fixture.paymentToken.address,
        owner: fixture.user.account.address,
        amount: quotedPrice,
        calldata: validCalldata,
        orderId: firstOrderId,
        calldataNonce: 4n,
        calldataDeadline: deadline,
      },
    );
    await fixture.ownerX402Adaptor.write.x402SpentEip3009WithCalldata([
      fixture.paymentToken.address,
      fixture.user.account.address,
      fixture.user.account.address,
      quotedPrice,
      0n,
      deadline,
      firstAuthNonce,
      firstAuthSignature.v,
      firstAuthSignature.r,
      firstAuthSignature.s,
      validCalldata,
      firstOrderId,
      4n,
      deadline,
      firstCalldataSignature.v,
      firstCalldataSignature.r,
      firstCalldataSignature.s,
    ]);

    const replayAuthNonce =
      "0x5252525252525252525252525252525252525252525252525252525252525252";
    const replayAuthSignature = await signReceiveWithAuthorization(
      fixture.userPaymentToken,
      fixture.user,
      fixture.ownerX402Adaptor.address,
      quotedPrice,
      fixture.chainId,
      0n,
      deadline,
      replayAuthNonce,
    );
    const replayCalldataSignature = await signX402Eip3009Calldata(
      fixture.ownerX402Adaptor,
      fixture.user,
      fixture.chainId,
      {
        token: fixture.paymentToken.address,
        owner: fixture.user.account.address,
        amount: quotedPrice,
        calldata: validCalldata,
        orderId: firstOrderId,
        calldataNonce: 5n,
        calldataDeadline: deadline,
      },
    );
    await hhViem.assertions.revertWithCustomError(
      fixture.ownerX402Adaptor.write.x402SpentEip3009WithCalldata([
        fixture.paymentToken.address,
        fixture.user.account.address,
        fixture.user.account.address,
        quotedPrice,
        0n,
        deadline,
        replayAuthNonce,
        replayAuthSignature.v,
        replayAuthSignature.r,
        replayAuthSignature.s,
        validCalldata,
        firstOrderId,
        5n,
        deadline,
        replayCalldataSignature.v,
        replayCalldataSignature.r,
        replayCalldataSignature.s,
      ]),
      fixture.ownerX402Adaptor,
      "OrderAlreadyProcessed",
    );
  });

  it("wraps, renews the underlying registrar entry, updates resolver records, creates subdomains, and unwraps `.goat` names", async function () {
    const fixture = await networkHelpers.loadFixture(deployFixture);

    const label = normalize("wrapme");
    const node = namehash(`${label}.goat`);
    const quotedPrice = await fixture.userController.read.rentPrice([
      label,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const request = {
      data: [] as `0x${string}`[],
      duration: YEAR,
      label,
      owner: fixture.user.account.address,
      referrer: ZERO_HASH,
      resolver: "0x0000000000000000000000000000000000000000" as Address,
      reverseRecord: 0,
      secret:
        "0x6666666666666666666666666666666666666666666666666666666666666666" as const,
    };
    const payment = {
      maxPaymentAmount: quotedPrice,
      paymentToken: fixture.paymentToken.address,
    };

    await fixture.userPaymentToken.write.approve([
      fixture.gnsRegistrarController.address,
      quotedPrice,
    ]);
    await commitRequest(
      fixture.userController,
      request,
      payment,
      fixture.networkHelpers,
    );
    await fixture.userController.write.register([request, payment]);

    const tokenId = toTokenId(label);
    await fixture.userBaseRegistrar.write.setApprovalForAll([
      fixture.goatNameWrapper.address,
      true,
    ]);
    await fixture.userGoatNameWrapper.write.wrapGoat2LD([
      label,
      fixture.user.account.address,
      Number(CANNOT_UNWRAP),
      fixture.publicResolver.address,
    ]);

    assertAddress(
      await fixture.baseRegistrar.read.ownerOf([tokenId]),
      fixture.goatNameWrapper.address,
    );
    assertAddress(
      await fixture.ensRegistry.read.owner([node]),
      fixture.goatNameWrapper.address,
    );

    await fixture.userPublicResolver.write.setText([
      node,
      "bio",
      "wrapped owner",
    ]);
    assert.equal(
      await fixture.publicResolver.read.text([node, "bio"]),
      "wrapped owner",
    );

    const registrarExpiryBefore = await fixture.baseRegistrar.read.nameExpires([
      tokenId,
    ]);
    const [, , wrappedExpiryBefore] =
      await fixture.goatNameWrapper.read.getData([BigInt(node)]);
    await fixture.userPaymentToken.write.approve([
      fixture.gnsRegistrarController.address,
      quotedPrice,
    ]);
    const renewPayment = {
      maxPaymentAmount: quotedPrice,
      paymentToken: fixture.paymentToken.address,
    };
    await fixture.userController.write.renew([label, renewPayment, YEAR]);
    const registrarExpiryAfter = await fixture.baseRegistrar.read.nameExpires([
      tokenId,
    ]);
    const [, , wrappedExpiryAfter] = await fixture.goatNameWrapper.read.getData(
      [BigInt(node)],
    );
    assert.ok(registrarExpiryAfter > registrarExpiryBefore);
    assert.equal(wrappedExpiryAfter, wrappedExpiryBefore);

    const childLabel = "vault";
    const childNode = namehash(`${childLabel}.${label}.goat`);
    await fixture.userGoatNameWrapper.write.setSubnodeOwner([
      node,
      childLabel,
      fixture.user.account.address,
      Number(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP),
      wrappedExpiryAfter,
    ]);
    const [childOwner, childFuses, childExpiry] =
      await fixture.goatNameWrapper.read.getData([BigInt(childNode)]);
    assertAddress(childOwner, fixture.user.account.address);
    assert.ok(
      (BigInt(childFuses) & (PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)) !== 0n,
    );
    assert.equal(childExpiry, wrappedExpiryAfter);

    const unwrapLabel = normalize("plainbox");
    const unwrapNode = namehash(`${unwrapLabel}.goat`);
    const unwrapPrice = await fixture.userController.read.rentPrice([
      unwrapLabel,
      fixture.paymentToken.address,
      YEAR,
    ]);
    const unwrapRequest = {
      ...request,
      label: unwrapLabel,
      secret:
        "0x7777777777777777777777777777777777777777777777777777777777777777" as const,
    };
    const unwrapPayment = {
      maxPaymentAmount: unwrapPrice,
      paymentToken: fixture.paymentToken.address,
    };
    const unwrapTokenId = toTokenId(unwrapLabel);

    await fixture.userPaymentToken.write.approve([
      fixture.gnsRegistrarController.address,
      unwrapPrice,
    ]);
    await commitRequest(
      fixture.userController,
      unwrapRequest,
      unwrapPayment,
      fixture.networkHelpers,
    );
    await fixture.userController.write.register([unwrapRequest, unwrapPayment]);
    await fixture.userBaseRegistrar.write.setApprovalForAll([
      fixture.goatNameWrapper.address,
      true,
    ]);
    await fixture.userGoatNameWrapper.write.wrapGoat2LD([
      unwrapLabel,
      fixture.user.account.address,
      0,
      fixture.publicResolver.address,
    ]);
    await fixture.userGoatNameWrapper.write.unwrapGoat2LD([
      labelhash(unwrapLabel),
      fixture.user.account.address,
      fixture.user.account.address,
    ]);
    assertAddress(
      await fixture.baseRegistrar.read.ownerOf([unwrapTokenId]),
      fixture.user.account.address,
    );
    assertAddress(
      await fixture.ensRegistry.read.owner([unwrapNode]),
      fixture.user.account.address,
    );
  });
});
