/* Questions answered on the method page (and as FAQ structured data). Every answer is true of the site as built. */
export type Faq = { q: string; a: string };

export const FAQ: Faq[] = [
  {
    q: "Does Parvex hold my tokens?",
    a: "No. Tokens stay in your wallet. The settler contract moves them only inside the one transaction that settles a deal, with transferFrom under the allowance you gave it, and it never keeps a balance. It has no owner, no admin, no upgrade and no payable function.",
  },
  {
    q: "What is the agent?",
    a: "A deterministic, rule-based assistant written in plain code, not a language model. Each side's agent sees only its own limit and the other side's last offer, opens near the Chainlink price when one exists, moves 40 % of the gap per round and stops at its limit. It proposes numbers; it never signs anything.",
  },
  {
    q: "Why is the seller's limit a net number?",
    a: "Because a price that looks right can still leave the seller short after fees. The seller enters the least they will receive after their own fee; the terminal and the contract both check gross minus fee against it, in the token's own integer units.",
  },
  {
    q: "What does Parvex charge?",
    a: "Nothing. Each side may sign a fee of up to 0.50 % to its own recipient (a broker or desk), shown in every review. The contract has no fee for Parvex and no switch to add one.",
  },
  {
    q: "What happens when a deal is refused?",
    a: "A transaction that reverts leaves no event. That is why the terminal asks the contract's checkDeal view first and shows every failing reason with its numbers before any wallet opens, and the dashboard keeps those refusals in this browser.",
  },
  {
    q: "How do alerts work?",
    a: "The bell in the header lists, for your connected wallet, deals of yours that settled (read from the settler's events), board orders that match yours, counter-offers to your orders and your orders about to expire. Enable browser notifications to get them while a Parvex tab is open. Free for everyone, web only: no email, no push service, nothing stored on a server.",
  },
  {
    q: "Mainnet or testnet?",
    a: "Both. Robinhood Chain (4663) and Robinhood Chain Testnet (46630) are selectable; the settler must be deployed on the network you pick. Practice mode needs neither: it runs on sample mandates in your browser.",
  },
  {
    q: "Do I need the $PARVEX token?",
    a: "No. Everything works without it, including the order board and alerts. Holding at least 0.1 % of the supply (read live on chain after a gas-free sign-in) raises two quotas: live orders on the board (3 to 25) and saved counterparties (5 to 100). No rewards, discounts or value of any kind are promised.",
  },
  {
    q: "Is Parvex connected to Robinhood?",
    a: "No. Parvex is an independent prototype that uses public contracts on Robinhood Chain. Stock tokens are tokens on Robinhood Chain, not the shares themselves. Nothing here is investment advice.",
  },
];
