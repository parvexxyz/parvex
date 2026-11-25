// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ParvexNetMath as M} from "./ParvexNetMath.sol";

interface IParvexERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
}

interface IParvexERC1271 {
    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4);
}

/// @title ParvexMandateSettler
/// @notice Atomic, non-custodial settlement of one OTC deal on Robinhood Chain. A seller and a buyer each sign an EIP-712
///         Order with the exact terms (asset, quote token, amount, gross price), their own hard limit (seller: minimum net
///         quote after their fee; buyer: maximum total quote including their fee), an optional fee to their own named
///         recipient (at most 0.50 %, Parvex takes nothing), an optional counterparty lock, an expiry and a nonce. Anyone may
///         submit the pair. In ONE transaction the contract moves the asset seller -> buyer and the quote buyer -> seller
///         (plus each signed fee) with transferFrom under the makers' own allowances, or refuses everything.
/// @dev    Never holds a balance: no payable function, no receive(), no owner, no admin, no fee switch, no upgrade.
///         checkDeal() returns a reason bitmask (0 = settleable) so a refusal can be shown before anyone signs or sends,
///         because a reverted transaction leaves no log. Every transfer is measured by the recipient's balance delta;
///         fee-on-transfer and rebasing tokens are refused. Tokens that return nothing (USDT style) are accepted.
contract ParvexMandateSettler {
    struct Order {
        address maker;
        /// 0 = sells `baseAmount` of base for quote, 1 = buys it.
        uint8 side;
        address base;
        address quote;
        uint256 baseAmount;
        /// Agreed price for the whole amount, in quote units, before fees. Both orders must sign the same number.
        uint256 quoteGross;
        /// Seller: minimum net quote received after the seller's fee. Buyer: maximum total quote paid including the buyer's fee.
        uint256 limitQuote;
        /// Fee this maker pays to `feeRecipient`, in basis points of quoteGross (seller: out of the price; buyer: on top).
        uint16 feeBps;
        address feeRecipient;
        /// Zero = any counterparty; otherwise only this maker may be on the other side.
        address counterparty;
        uint64 expiry;
        uint256 nonce;
    }

    uint8 public constant SIDE_SELL = 0;
    uint8 public constant SIDE_BUY = 1;

    // ---- reason bits returned by checkDeal (mirrored in src/lib/otc/bits.ts; a parity test reads these lines) ----
    uint256 public constant R_SIDE = 1 << 0;
    uint256 public constant R_TOKENS = 1 << 1;
    uint256 public constant R_AMOUNT = 1 << 2;
    uint256 public constant R_PRICE = 1 << 3;
    uint256 public constant R_SELF_MATCH = 1 << 4;
    uint256 public constant R_SELL_EXPIRED = 1 << 5;
    uint256 public constant R_BUY_EXPIRED = 1 << 6;
    uint256 public constant R_SELL_COUNTERPARTY = 1 << 7;
    uint256 public constant R_BUY_COUNTERPARTY = 1 << 8;
    uint256 public constant R_SELL_NONCE = 1 << 9;
    uint256 public constant R_BUY_NONCE = 1 << 10;
    uint256 public constant R_SELL_SIGNATURE = 1 << 11;
    uint256 public constant R_BUY_SIGNATURE = 1 << 12;
    uint256 public constant R_SELL_FEE = 1 << 13;
    uint256 public constant R_BUY_FEE = 1 << 14;
    uint256 public constant R_SELLER_NET = 1 << 15;
    uint256 public constant R_BUYER_TOTAL = 1 << 16;
    uint256 public constant R_SELLER_BALANCE = 1 << 17;
    uint256 public constant R_SELLER_ALLOWANCE = 1 << 18;
    uint256 public constant R_BUYER_BALANCE = 1 << 19;
    uint256 public constant R_BUYER_ALLOWANCE = 1 << 20;

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,uint8 side,address base,address quote,uint256 baseAmount,uint256 quoteGross,uint256 limitQuote,uint16 feeBps,address feeRecipient,address counterparty,uint64 expiry,uint256 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Parvex Mandate Settler");
    bytes32 private constant VERSION_HASH = keccak256("1");
    /// @dev secp256k1n / 2: signatures with a higher s are malleable copies and are refused.
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomain;

    /// @notice Nonce consumed by a settlement or cancelled by its maker.
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    /// @notice Every nonce below this is void for the maker (cancel-all).
    mapping(address => uint256) public minNonce;
    /// @notice Orders a maker approved by transaction instead of a signature (contract wallets, or by preference).
    mapping(bytes32 => bool) public approvedOnChain;
    /// @notice Number of settled deals; also the index carried by each Settled event.
    uint256 public settlementCount;

    uint256 private _lock = 1;

    event OrderApproved(bytes32 indexed orderHash, address indexed maker, uint256 nonce);
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker, uint256 nonce);
    event NoncesCancelled(address indexed maker, uint256 minNonce);
    /// @notice Proof of settlement. dealId = keccak256(sellHash, buyHash).
    event Settled(
        bytes32 indexed dealId,
        address indexed seller,
        address indexed buyer,
        address base,
        address quote,
        uint256 baseAmount,
        uint256 quoteGross,
        uint256 index
    );
    /// @notice The money side of the same settlement: what the seller kept and what each signed fee paid.
    event SettledAmounts(
        bytes32 indexed dealId, bytes32 sellHash, bytes32 buyHash, uint256 sellerNet, uint256 sellerFee, uint256 buyerFee, address settledBy
    );

    error DealRefused(uint256 reasons);
    error NotMaker();
    error NonceNotHigher();
    error Reentrancy();
    error TransferFailed(address token);
    error ExactAmountMismatch(address token, uint256 expected, uint256 received);

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor() {
        _cachedChainId = block.chainid;
        _cachedDomain = _buildDomain();
    }

    // ------------------------------------------------------------------ hashing

    function domainSeparator() public view returns (bytes32) {
        return block.chainid == _cachedChainId ? _cachedDomain : _buildDomain();
    }

    function _buildDomain() private view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice EIP-712 digest a maker signs for `o`.
    function hashOrder(Order calldata o) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                o.maker,
                o.side,
                o.base,
                o.quote,
                o.baseAmount,
                o.quoteGross,
                o.limitQuote,
                o.feeBps,
                o.feeRecipient,
                o.counterparty,
                o.expiry,
                o.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function dealId(bytes32 sellHash, bytes32 buyHash) public pure returns (bytes32) {
        return keccak256(abi.encode(sellHash, buyHash));
    }

    // ------------------------------------------------------------------ maker actions

    /// @notice Approve an order by transaction (no signature needed at settlement). Only its maker can.
    function approveOrder(Order calldata o) external {
        if (msg.sender != o.maker) revert NotMaker();
        bytes32 h = hashOrder(o);
        approvedOnChain[h] = true;
        emit OrderApproved(h, o.maker, o.nonce);
    }

    /// @notice Cancel one order (its nonce). Takes effect for any settlement in a later transaction, including this block.
    function cancelOrder(Order calldata o) external {
        if (msg.sender != o.maker) revert NotMaker();
        nonceUsed[o.maker][o.nonce] = true;
        bytes32 h = hashOrder(o);
        approvedOnChain[h] = false;
        emit OrderCancelled(h, o.maker, o.nonce);
    }

    /// @notice Void every order of the caller with a nonce below `newMinNonce`.
    function cancelUpTo(uint256 newMinNonce) external {
        if (newMinNonce <= minNonce[msg.sender]) revert NonceNotHigher();
        minNonce[msg.sender] = newMinNonce;
        emit NoncesCancelled(msg.sender, newMinNonce);
    }

    // ------------------------------------------------------------------ views

    /// @notice Net-receipt numbers for a pair of orders, using the seller's gross price.
    function quoteDeal(Order calldata sell, Order calldata buy)
        external
        pure
        returns (uint256 sellerNet, uint256 sellerFee, uint256 buyerTotal, uint256 buyerFee, uint256 minGross, uint256 maxGross)
    {
        uint16 sb = sell.feeBps > M.MAX_FEE_BPS ? M.MAX_FEE_BPS : sell.feeBps;
        uint16 bb = buy.feeBps > M.MAX_FEE_BPS ? M.MAX_FEE_BPS : buy.feeBps;
        uint256 g = sell.quoteGross > M.MAX_AMOUNT ? M.MAX_AMOUNT : sell.quoteGross;
        (sellerNet, sellerFee) = M.sellerNet(g, sb);
        (buyerTotal, buyerFee) = M.buyerTotal(g, bb);
        minGross = M.minGrossForNet(sell.limitQuote > M.MAX_AMOUNT ? M.MAX_AMOUNT : sell.limitQuote, sb);
        maxGross = M.maxGrossForBudget(buy.limitQuote, bb);
    }

    /// @notice Every reason the pair would be refused right now (0 = settle() will go through unless a token misbehaves
    ///         during the transfer). Reads balances and allowances; never reverts on a hostile token.
    function checkDeal(Order calldata sell, bytes calldata sellSig, Order calldata buy, bytes calldata buySig)
        public
        view
        returns (uint256 reasons)
    {
        reasons = _checkTerms(sell, buy);
        bytes32 sh = hashOrder(sell);
        bytes32 bh = hashOrder(buy);
        if (!_nonceOpen(sell.maker, sell.nonce)) reasons |= R_SELL_NONCE;
        if (!_nonceOpen(buy.maker, buy.nonce)) reasons |= R_BUY_NONCE;
        if (!_authorized(sell.maker, sh, sellSig)) reasons |= R_SELL_SIGNATURE;
        if (!_authorized(buy.maker, bh, buySig)) reasons |= R_BUY_SIGNATURE;
        reasons |= _checkFunds(sell, buy);
    }

    function _checkTerms(Order calldata sell, Order calldata buy) private view returns (uint256 r) {
        if (sell.side != SIDE_SELL || buy.side != SIDE_BUY) r |= R_SIDE;
        if (
            sell.base != buy.base || sell.quote != buy.quote || sell.base == sell.quote || sell.base.code.length == 0
                || sell.quote.code.length == 0
        ) r |= R_TOKENS;
        if (sell.baseAmount != buy.baseAmount || sell.baseAmount == 0 || sell.baseAmount > M.MAX_AMOUNT) r |= R_AMOUNT;
        if (sell.quoteGross != buy.quoteGross || sell.quoteGross == 0 || sell.quoteGross > M.MAX_AMOUNT) r |= R_PRICE;
        if (sell.maker == buy.maker || sell.maker == address(0) || buy.maker == address(0)) r |= R_SELF_MATCH;
        if (block.timestamp > sell.expiry) r |= R_SELL_EXPIRED;
        if (block.timestamp > buy.expiry) r |= R_BUY_EXPIRED;
        if (sell.counterparty != address(0) && sell.counterparty != buy.maker) r |= R_SELL_COUNTERPARTY;
        if (buy.counterparty != address(0) && buy.counterparty != sell.maker) r |= R_BUY_COUNTERPARTY;
        if (!_feeOk(sell, buy.maker)) r |= R_SELL_FEE;
        if (!_feeOk(buy, sell.maker)) r |= R_BUY_FEE;
        // Limits are only meaningful on an in-range price; the price bit already covers the rest.
        if (sell.quoteGross <= M.MAX_AMOUNT && sell.feeBps <= M.MAX_FEE_BPS) {
            (uint256 net,) = M.sellerNet(sell.quoteGross, sell.feeBps);
            if (net < sell.limitQuote) r |= R_SELLER_NET;
        }
        if (buy.quoteGross <= M.MAX_AMOUNT && buy.feeBps <= M.MAX_FEE_BPS) {
            (uint256 total,) = M.buyerTotal(buy.quoteGross, buy.feeBps);
            if (total > buy.limitQuote) r |= R_BUYER_TOTAL;
        }
    }

    /// @dev A fee needs a real recipient that is neither side of the deal (a self-paid fee could not be measured) nor this
    ///      contract (which must never end a transaction holding tokens).
    function _feeOk(Order calldata o, address other) private view returns (bool) {
        if (o.feeBps > M.MAX_FEE_BPS) return false;
        if (o.feeBps == 0) return true;
        return o.feeRecipient != address(0) && o.feeRecipient != o.maker && o.feeRecipient != other && o.feeRecipient != address(this);
    }

    function _checkFunds(Order calldata sell, Order calldata buy) private view returns (uint256 r) {
        if (sell.base.code.length == 0 || sell.quote.code.length == 0) return 0;
        uint256 amt = sell.baseAmount;
        if (_read(sell.base, abi.encodeCall(IParvexERC20.balanceOf, (sell.maker))) < amt) r |= R_SELLER_BALANCE;
        if (_read(sell.base, abi.encodeCall(IParvexERC20.allowance, (sell.maker, address(this)))) < amt) r |= R_SELLER_ALLOWANCE;
        uint256 g = buy.quoteGross > M.MAX_AMOUNT ? M.MAX_AMOUNT : buy.quoteGross;
        uint16 bb = buy.feeBps > M.MAX_FEE_BPS ? M.MAX_FEE_BPS : buy.feeBps;
        (uint256 total,) = M.buyerTotal(g, bb);
        if (_read(sell.quote, abi.encodeCall(IParvexERC20.balanceOf, (buy.maker))) < total) r |= R_BUYER_BALANCE;
        if (_read(sell.quote, abi.encodeCall(IParvexERC20.allowance, (buy.maker, address(this)))) < total) r |= R_BUYER_ALLOWANCE;
    }

    /// @dev uint256 view call that reads as 0 on a revert, a short answer or an out-of-gas token.
    function _read(address token, bytes memory data) private view returns (uint256 v) {
        (bool ok, bytes memory ret) = token.staticcall{gas: 100_000}(data);
        if (ok && ret.length >= 32) v = abi.decode(ret, (uint256));
    }

    function _nonceOpen(address maker, uint256 nonce) private view returns (bool) {
        return nonce >= minNonce[maker] && !nonceUsed[maker][nonce];
    }

    function _authorized(address maker, bytes32 digest, bytes calldata sig) private view returns (bool) {
        if (sig.length == 0) return approvedOnChain[digest];
        if (maker.code.length > 0) {
            (bool ok, bytes memory ret) =
                maker.staticcall{gas: 200_000}(abi.encodeCall(IParvexERC1271.isValidSignature, (digest, sig)));
            return ok && ret.length >= 32 && bytes4(abi.decode(ret, (bytes32))) == IParvexERC1271.isValidSignature.selector;
        }
        if (sig.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > HALF_N || (v != 27 && v != 28)) return false;
        address signer = ecrecover(digest, v, r, s);
        return signer != address(0) && signer == maker;
    }

    // ------------------------------------------------------------------ settlement

    /// @notice Settle a signed pair atomically. Reverts with DealRefused(reasons) when checkDeal is not zero.
    function settle(Order calldata sell, bytes calldata sellSig, Order calldata buy, bytes calldata buySig)
        external
        nonReentrant
        returns (bytes32 id)
    {
        uint256 reasons = checkDeal(sell, sellSig, buy, buySig);
        if (reasons != 0) revert DealRefused(reasons);

        bytes32 sh = hashOrder(sell);
        bytes32 bh = hashOrder(buy);
        id = dealId(sh, bh);

        // Effects first: both nonces are spent before any token is called.
        nonceUsed[sell.maker][sell.nonce] = true;
        nonceUsed[buy.maker][buy.nonce] = true;
        uint256 index = ++settlementCount;

        (uint256 net, uint256 sellFee) = M.sellerNet(sell.quoteGross, sell.feeBps);
        (, uint256 buyFee) = M.buyerTotal(sell.quoteGross, buy.feeBps);

        _moveExact(sell.base, sell.maker, buy.maker, sell.baseAmount);
        _moveExact(sell.quote, buy.maker, sell.maker, net);
        if (sellFee > 0) _moveExact(sell.quote, buy.maker, sell.feeRecipient, sellFee);
        if (buyFee > 0) _moveExact(sell.quote, buy.maker, buy.feeRecipient, buyFee);

        emit Settled(id, sell.maker, buy.maker, sell.base, sell.quote, sell.baseAmount, sell.quoteGross, index);
        emit SettledAmounts(id, sh, bh, net, sellFee, buyFee, msg.sender);
    }

    /// @dev transferFrom that accepts tokens returning nothing, refuses false/short answers, and checks the exact delta.
    function _moveExact(address token, address from, address to, uint256 amount) private {
        uint256 before = IParvexERC20(token).balanceOf(to);
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert TransferFailed(token);
        uint256 afterBal = IParvexERC20(token).balanceOf(to);
        uint256 received = afterBal >= before ? afterBal - before : 0;
        if (received != amount) revert ExactAmountMismatch(token, amount, received);
    }
}
