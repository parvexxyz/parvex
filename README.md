# Parvex

Parvex is an OTC negotiation terminal for Robinhood Chain. Negotiating a block trade in chat is slow, and a price that looks right can still leave the seller short once fees are paid. In Parvex a buyer and a seller each enter a mandate (asset, amount, price limit, expiry); the terminal matches mandates, a rule-based agent trades counter-offers strictly inside both limits, and every condition is shown with its numbers: the buyer's maximum total and the seller's minimum net after fees. Both wallets then sign the exact terms and one transaction moves both legs, or nothing moves.

Agent-assisted OTC negotiation with clear limits and wallet approval for Robinhood Chain. Set your limit, see your net, sign one atomic swap.

## Read this before anything else

This repository is the working code behind https://parvex.xyz.

- **What runs today.** The terminal (mandate book, matching, zone of agreement, the negotiation agent, the deal check, review and authorize), practice mode on sample mandates with no wallet, EIP-712 order signing, an open order relay board (post, take, withdraw; checked against the chain), export and import of signed orders, exact-amount token approvals, the contract's `checkDeal` pre-check and `settle`, a dashboard of settlement proofs read from the contract's logs, and free alerts (a bell inbox plus browser notifications).
- **The agent is plain code.** It is deterministic and rule-based (no language model): it sees only its own limit and the other side's last offer, never offers past its limit, and never signs anything.
- **Live data.** Robinhood Chain head block, gas and Chainlink ETH/USD; Robinhood stock tokens proven on chain (beacon-proxy code hash, beacon slot, minted supply) with their Chainlink stock feeds; USDG and WETH metadata read on chain. Stock tokens are tokens on Robinhood Chain, not the shares themselves.
- **The contract is live on Robinhood Chain.** `ParvexMandateSettler` at `0x71f84ce6cb069aeb4eb2627dbaa2a2e30cceea1f` (source verified on Blockscout; `verify-deployment` MATCH). It has unit, fuzz, invariant and Robinhood Chain fork tests plus a written self-review, but no outside security review: start with small amounts. It is not deployed on the testnet, where the terminal runs in practice mode.
- **Token features.** A wallet holding at least 0.1 % of the $PARVEX supply (read on chain after a gas-free EIP-4361 sign-in) gets larger server quotas: 25 live orders on the board instead of 3, and 100 saved counterparties instead of 5. Until the token launches this shows "Unlocks at launch" and the free tier works fully.
- **Not claimed.** Nothing here is investment advice or a guarantee of safety. $PARVEX has no promised value and Parvex works without it. Partial fills are planned and not built.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (`/`, `/terminal`, `/dashboard`, `/method`, `/token`) and API routes (`/api/chain`, `/api/assets`, `/api/desk`, `/api/rpc`, `/api/board`, `/api/holder`, `/api/lists`). |
| `src/components/` | Interface components: terminal, dashboard, holder panel, order board, alert bell, home sections, wallet connection, header and footer. |
| `src/lib/holder/`, `src/lib/board/` | Sign-in session verification, holder tier math and quotas, order board rules. |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `contracts.ts` (networks and deployed addresses), `dex.ts`, `chain.ts`. |
| `src/lib/otc/` | The engine: net math, reason bits, matching, the agent, EIP-712 orders, practice mandates. |
| `src/lib/` | Chain reads, the rate-limited RPC relay, and the logic the tests cover. |
| `contracts/` | Solidity sources (`src/`) and Foundry tests (`test/`). |
| `scripts/` | `verify-deployment` and the contract artifact builder. |
| `public/` | Static images and wallet icons. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test --no-match-contract Fork
forge test --match-contract Fork --fork-url https://rpc.mainnet.chain.robinhood.com --evm-version cancun
```

### What was checked for this snapshot

2026-11-25 (UTC), Node.js v25.8.2, forge 1.5.1: `npm run typecheck` exit 0; `npm test` 44 pass / 0 fail (engine parity with the Solidity bits, type hash and digest, net-math sweeps, the agent never crossing a bound over 2,000 random pairs, sign-in session checks, tier math at exactly 0.1 %, board quotas and caps, alert derivation, bounded memory store, relay and rate-limit rules, verify-deployment against a fake chain); `npm run build` 0 errors, 22 routes; `forge test --no-match-contract Fork` 36 passed (22 unit, 5 hostile-token, 3 net-math fuzz, 1 settlement fuzz, 4 invariants, 1 digest fixture); fork suite 4 passed against Robinhood Chain with real NVDA stock tokens and USDG. A browser end-to-end run on a local chain with chain id 4663 (two wallets with a test token: holder and free tier, post to the board, take from it, check, approve, settle, replay refused, board pruned, bell alert, server quotas) passed 6 of 6 steps; it needs a local chain and is not part of `npm test`.

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6700. Everything works with no configuration: live chain data through the public RPC, practice mode, and the wallet flow. Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the WalletConnect row says "Not configured on this site yet"; without `ROBINHOOD_RPC_URL` the server reads the public endpoints.

## Contracts

| Contract | Robinhood Chain | Robinhood Chain Testnet |
|---|---|---|
| `ParvexMandateSettler` | [`0x71f84ce6cb069aeb4eb2627dbaa2a2e30cceea1f`](https://robinhoodchain.blockscout.com/address/0x71f84ce6cb069aeb4eb2627dbaa2a2e30cceea1f?tab=contract) (block 122889194, source verified) | not deployed |

`ParvexMandateSettler` (with the internal library `ParvexNetMath`) settles one OTC deal atomically. Each side signs an EIP-712 order with the exact terms, its own limit (the seller's minimum net after its fee, the buyer's maximum total including its fee), an optional fee of at most 0.50 % to its own recipient, an optional counterparty lock, an expiry and a nonce. `checkDeal` returns a 21-bit reason mask (0 = settleable); `settle` moves the asset seller → buyer and the payment buyer → seller with `transferFrom` in one transaction, measuring every leg by the receiver's balance change. It has no owner, no admin, no fee for Parvex, no upgrade, no payable function, and never holds a balance.

## Verify a deployment

```
npm run verify-deployment -- --settler 0x71f84ce6cb069aeb4eb2627dbaa2a2e30cceea1f --settler-tx 0xdb912ad0683d4fd3a47600af451892368e8079ce3473b3499086269cf4bbeb87
```

The script compares the bytecode on chain with the build in this repository (the two immutable words are checked by value: the chain id and the EIP-712 domain of that address) and prints MATCH or the first difference. Set `VERIFY_RPC_URL` to the testnet RPC for a testnet deployment.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

Testnet: chain ID 46630, RPC https://rpc.testnet.chain.robinhood.com, explorer https://explorer.testnet.chain.robinhood.com. The site offers to add the selected network when you connect.

## Data sources and limits

- Robinhood Chain RPC (the site's own rate-limited relay first, then public endpoints): head block, gas, Chainlink ETH/USD, stock-token proofs, Chainlink stock feeds, token metadata, balances, allowances, `checkDeal`, contract logs.
- Stock-token candidates come from a fixture of the beacon's log emitters; each is re-proven on chain before it is listed. A candidate whose proof cannot be read is not listed.
- Chainlink stock feeds have a 24-hour heartbeat and go stale outside market hours; the age of every price is shown. USDG is valued at 1 USD for the reference price only.
- Answers are cached for seconds (the stock board up to 45 s); a failed read is never cached and the page shows "—" or says the source is unavailable.
- Offers, refusals, signatures and your mandates stay in your browser's storage; nothing is sent to a server.

## Token

$PARVEX is the community token of Parvex on Robinhood Chain. Contract address: announced on https://parvex.xyz at launch. It has no promised value. Token features: holders (balance ≥ 0.1 % of totalSupply, read on chain) get 25 live orders on the order board instead of 3 and 100 saved counterparties instead of 5. Everything else, alerts included, is free.

## Deploy your own

1. Import the repository into a Next.js host (framework preset Next.js, root `./`).
2. Optional environment variables:

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Server reads, including log scans for the dashboard | `https://…` |
| `ROBINHOOD_TESTNET_RPC_URL` | Server reads on the testnet | `https://…` |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Browser RPC override (public) | `https://…` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect in the wallet dialog | 32 hex characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared rate-limit store | `https://…`, token string |
| `STORE_KEY_PREFIX` | Key prefix in that store | short text, default `parvex:` |
| `ROBINHOOD_TESTNET_RPC_URL` | Server reads on the testnet (board checks) | `https://…` |

Without `KV_REST_API_URL`/`KV_REST_API_TOKEN` the board and saved lists live in the server's memory and the pages say "Not configured: saved data may be lost on restart". No secret is needed for sign-in.

3. Point your domain at the deployment and check `/` (200), `/api/chain` (JSON with a block number) and `/api/assets` (JSON list).
4. Contract (only for your own deployment): deploy `ParvexMandateSettler` from `contracts/` (no constructor arguments) with your own tooling. Paste the address, block and transaction into `src/config/contracts.ts` under that network, then run `npm run verify-deployment`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The contract, the API routes, order signing and transaction building are in scope; wallets, RPC providers, explorers and launchpads are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). Self-hosted fonts are under the SIL Open Font License (`src/fonts/OFL-*.txt`): Inter, Inter Tight and Geist Mono. Wallet logos in `public/wallets/` belong to their projects and are used only to identify each wallet. The Parvex name, logo and artwork belong to the project and are not licensed for reuse as a brand.
