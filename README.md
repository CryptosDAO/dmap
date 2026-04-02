# dmap — Modernized Maintenance Fork

This is a maintained fork of the original dapphub projects by **Nikolai Mushegian**.

Nikolai was a brilliant early Ethereum developer and co-founder of **MakerDAO**, where he helped design the original **DAI** stablecoin system. He also created **WETH**, co-authored the **Balancer** whitepaper, and contributed to **RAI** and many other foundational DeFi primitives. He tragically passed away in 2022 at age 29.

We have updated these repositories to work with ethers.js v6.16.0, modern Solidity, Helia for IPFS, and current tooling — while preserving the original minimalist, immutable, and corruption-resistant design Nikolai championed.

**This fork is maintained in honor of Nikolai's legacy and his commitment to simple, auditable, backdoor-free systems.**

Original repositories: [dapphub/dpack](https://github.com/dapphub/dpack) and [dapphub/dmap](https://github.com/dapphub/dmap)  
Nikolai's site: https://nikolai.fyi/

## Changes Made

- Migrated from `ethers` v5 to `ethers` v6.16.0 (bigint-native, updated Contract/Interface/AbiCoder APIs).
- Updated Solidity contracts to `pragma solidity ^0.8.25` with NatSpec and custom errors.
- Replaced `@nomiclabs/hardhat-ethers` with `@nomicfoundation/hardhat-ethers` v3.
- Replaced `@defi-wonderland/smock` with native Hardhat account impersonation.
- Replaced `minihat` with a lightweight ethers v6-compatible test helper.
- Updated Hardhat to v2.28+ and all other dependencies to latest stable versions.
- Added GitHub Actions CI workflow.
- Prepared for scoped npm publishing under `@cryptosdao/dmap`.
- **Contract logic and dpath immutability design are unchanged.**
- **Mainnet address remains `0x90949c9937A11BA943C7A72C3FA073a37E3FdD96`.**

---

Here is the dmap address: `0x90949c9937A11BA943C7A72C3FA073a37E3FdD96`

## Overview

`dmap` is a minimalist key-value store built to solve the problem
that DNS and the certificate authority PKI is backdoored.

The main thing about dmap is that it has a native concept
of immutability, while still allowing user-defined registry logic.

`dpath` is a path format used for traversing the dmap registries.
This path format also has a concept of 'verify immutable',
and the syntax is designed to be discerned easily at a glance.

```
:pack:rico.latest
          ^  warning, the value of this path is mutable, starting here

:pack:rico:v2
          ^  here you can see it is locked
```

One of the core design motives for dmap was to make it as simple as possible
to write lightweight / embeddable state proof verifiers.

By keeping all state in one contract object and making user registries call
into this one object, merkle proofs for traversals of subregistries
are compact and do not require spinning up an EVM.

Locked entries can safely be cached, assuming that Ethereum's security properties hold.
It is a canary in the coal mine for the rest of the system -- if you can't depend
on locked dmap values, you can't depend on Ethereum.

The mechanism design of the root and free registries is intentionally "naive",
but because it is neutral and final, it is good enough to build on.

## Installation & Testing

```bash
npm install
npx hardhat compile
npx mocha test
```

## Publishing

```bash
npm publish --access public
```
