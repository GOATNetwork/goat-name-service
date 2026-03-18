This project is a Hardhat 3 project using the native Node.js test runner (`node:test`) and the `viem` library for Ethereum interactions.

To learn more about the Hardhat 3, please visit the [Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3).

## Project Overview

- A Hardhat configuration file.
- TypeScript integration tests using [`node:test`](nodejs.org/api/test.html), the new Node.js native test runner, and [`viem`](https://viem.sh/).

## Usage

To compile all the contracts in the project, execute the following command:

```shell
npm run compile
```

To run all the tests in the project, execute the following command:

```shell
npm test
```

Don't run compile and test separately! The `test` command automatically compiles the contracts before running the tests.

To format all the Solidity files in the project, execute the following command:

```shell
npm run fmt
```

## Solidity Commenting Guidelines

Purpose: Make contracts easier to review, audit, and maintain. Comments should explain **why**, **assumptions**, **constraints**, and **security implications**—not restate obvious code.

### 1) Core rules (MUST)

1. **Accuracy over quantity**: whenever code changes, update or delete related comments in the same PR.
2. **Explain “why”, not “what”**: avoid comments that just paraphrase the statement.
3. **NatSpec required for public surface**: every `contract/interface/library`, and every `public/external` function, event, error, and modifier MUST have NatSpec.
4. **Make security assumptions explicit**: access control, external calls/callbacks, accounting/rounding, upgradeability, `unchecked`, and `assembly` MUST be documented.
5. **No dead code in comments**: do not keep commented-out code; use Git history.
6. **No vague TODOs**: TODOs must include an actionable description and (when available) an issue/PR reference.

### 2) NatSpec standard (MUST)

#### 2.1 Contracts / interfaces / libraries

Each MUST include:

- `@title`
- `@notice` (user-facing behavior)
- `@dev` (implementation constraints + security model)
- Recommended: `@custom:*` tags (see Section 5)

Example:

```solidity
/// @title Vault
/// @notice Deposits and withdraws an ERC20 token in exchange for shares.
/// @dev Assumes a standard ERC20 unless explicitly stated (no rebasing, no fee-on-transfer).
/// @custom:security External calls exist in withdraw paths; follow CEI and reentrancy protections.
/// @custom:invariant totalAssets() == token.balanceOf(address(this))
contract Vault {}
```

#### 2.2 Functions (`public` / `external`)

Every `public/external` function MUST include:

- `@notice` (single sentence, user perspective; start with a verb: Deposit/Withdraw/Claim/Set/Update)
- `@dev` (access control, assumptions, external calls, rounding rules, edge cases, failure modes)
- `@param` for every parameter
- `@return` for every return value (prefer named returns and document with the same name)

Example:

```solidity
/// @notice Deposits `assets` and mints shares to `receiver`.
/// @dev Access: permissionless. Assumption: token is a standard ERC20 (no fee-on-transfer).
/// @param receiver The account that receives minted shares.
/// @param assets The amount of underlying tokens to deposit.
/// @return shares The number of shares minted to `receiver`.
function deposit(
  address receiver,
  uint256 assets
) external returns (uint256 shares);
```

#### 2.3 Events / errors / modifiers

- **Events**: document when it is emitted and meaning of each field.
- **Errors**: document the condition that triggers the revert.
- **Modifiers**: document the enforced constraint (typically access control).

Example:

```solidity
/// @notice Emitted when `owner` approves `spender` to spend `value`.
/// @param owner Token owner.
/// @param spender Approved spender.
/// @param value Allowance amount.
event Approval(address indexed owner, address indexed spender, uint256 value);

/// @dev Reverts when `amount` is zero.
error ZeroAmount();

/// @dev Restricts execution to accounts with MANAGER_ROLE.
modifier onlyManager() { _; }
```

### 3) Inline comments (`//`) (RESTRICTED)

Inline comments are allowed only to explain things that are not obvious from the code, such as:

1. Non-trivial logic (bit tricks, unusual branching, edge-case handling)
2. Security-relevant decisions (reentrancy/callback risks, trust boundaries)
3. Accounting/math details (rounding direction, precision, invariants)
4. `unchecked` and `assembly` safety justification (MUST)

Example:

```solidity
unchecked {
    // Safe: i < n and n is bounded by array length; saves gas in a tight loop.
    ++i;
}
```

Prohibited:

- Obvious paraphrases (e.g., `// increment i`)
- Commented-out code
- “Temporary” notes with no action plan

### 4) Security-critical documentation checklist (MUST when applicable)

If any item applies, document it in the closest relevant place (function `@dev` and/or contract-level `@dev`):

1. **Access control & trust model**
   - Who can call it (owner/role/timelock/governance)
   - What privileged actors can do (e.g., can move user funds, can change parameters to unsafe values)

2. **External calls & reentrancy**
   - Which calls can trigger callbacks (`call`, ERC777 hooks, `safeTransferFrom`, etc.)
   - Mitigations used (CEI pattern, `ReentrancyGuard`, pull-over-push)

3. **Token behavior assumptions**
   - Explicitly state support/non-support for: fee-on-transfer, rebasing, ERC777 hooks
   - If unsupported, say so clearly (default assumption is “standard ERC20” only if stated)

4. **Accounting / pricing / rounding**
   - Rounding direction (down/up) and dust handling
   - Any invariants the system relies on

5. **Upgradeability (if used)**
   - Initializer requirements and versioning/migration notes
   - Storage layout constraints (ordering, gaps)
   - Who can upgrade and the intended upgrade process

6. **`assembly` / low-level calls**
   - Memory/storage assumptions and safety constraints
   - Return data parsing assumptions

### 5) Custom NatSpec tags (RECOMMENDED, consistent semantics)

Use `@custom:*` for standardized, searchable annotations:

- `@custom:security` Key risks and mitigations
- `@custom:assumption` Key assumptions (oracle trust, token behavior, environment)
- `@custom:invariant` Invariants that should always hold
- `@custom:upgrade` Upgrade/storage-layout notes
- `@custom:audit` Items that deserve special audit attention (link to issue/PR when available)

---

### 6) Style & wording conventions (MUST)

1. **Use short sentences** and concrete language.
2. `@notice` stays user-facing; **no** implementation details.
3. `@dev` may use bullet points; include constraints, edge cases, revert conditions, and security notes.
4. **Consistent terminology** across the repo (e.g., assets/shares/underlying; fee/slippage; oracle/price feed).
5. Avoid ambiguous words like “safe”, “secure”, “guaranteed” unless you also state the precise conditions.

### 7) Minimal template (copy/paste)

```solidity
/// @title <ContractName>
/// @notice <User-facing summary>
/// @dev <Constraints, access control, threat model>
/// @custom:security <Key risks and mitigations>
/// @custom:assumption <Key assumptions>
/// @custom:invariant <Key invariants>
contract <ContractName> {

    /// @notice <Verb...>
/// @dev Access: <...>. External calls: <...>. Rounding: <...>. Assumptions: <...>.
/// @param <p1> <Description>
/// @return <r1> <Description>
    function <fn>(...) external returns (...) { }
}
```
