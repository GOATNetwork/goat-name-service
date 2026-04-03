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

Always run `npm run fmt` before committing to ensure consistent code formatting across the project.

## Solidity Commenting Guidelines

**Goal**: Improve readability, auditability, and maintainability. Comments must explain **why, assumptions, constraints, and security**, not restate code.

Core Rules (MUST)

- **Keep comments accurate**: update with code changes
- **Explain “why”, not “what”**
- **NatSpec required for all public surfaces** (contracts, interfaces, libraries, public/external functions, events, errors, modifiers)
- **Document security assumptions explicitly**: access control, external calls, accounting/rounding, upgradeability, `unchecked`, `assembly`
- **No commented-out code** (use Git history)
- **TODOs must be actionable** (include issue/PR if possible)

Minimal Template

```solidity
/// @title <Name>
/// @notice <User summary>
/// @dev <Constraints + security>
/// @custom:security <...>
/// @custom:assumption <...>
/// @custom:invariant <...>
contract X {
    /// @notice <Verb...>
    /// @dev Access: ... External calls: ... Rounding: ...
    /// @param p ...
    /// @return r ...
    function f(...) external returns (...) {}
}
```
