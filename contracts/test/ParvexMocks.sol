// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ParvexMandateSettler} from "../src/ParvexMandateSettler.sol";

/// Plain ERC-20 used by the unit tests and the local E2E chain.
contract ParvexTestToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        totalSupply += v;
        emit Transfer(address(0), to, v);
    }

    function approve(address s, uint256 v) public virtual returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transfer(address to, uint256 v) public virtual returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) public virtual returns (bool) {
        _spend(f, v);
        _move(f, to, v);
        return true;
    }

    function _spend(address f, uint256 v) internal {
        uint256 a = allowance[f][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
    }

    function _move(address f, address to, uint256 v) internal virtual {
        require(balanceOf[f] >= v, "balance");
        balanceOf[f] -= v;
        balanceOf[to] += v;
        emit Transfer(f, to, v);
    }
}

/// USDT-style token: approve/transfer/transferFrom return nothing.
contract ParvexNoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public constant decimals = 6;

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function approve(address s, uint256 v) external {
        allowance[msg.sender][s] = v;
    }

    function transferFrom(address f, address to, uint256 v) external {
        require(allowance[f][msg.sender] >= v && balanceOf[f] >= v, "nope");
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[to] += v;
    }
}

/// Moves the tokens but answers false.
contract ParvexFalseToken is ParvexTestToken("False", "FALSE", 18) {
    function transferFrom(address f, address to, uint256 v) public override returns (bool) {
        super.transferFrom(f, to, v);
        return false;
    }
}

/// Takes 1 % on every move.
contract ParvexFeeToken is ParvexTestToken("Fee", "FEE", 18) {
    function _move(address f, address to, uint256 v) internal override {
        require(balanceOf[f] >= v, "balance");
        uint256 cut = v / 100;
        balanceOf[f] -= v;
        balanceOf[to] += v - cut;
        totalSupply -= cut;
        emit Transfer(f, to, v - cut);
    }
}

/// Tries to settle a second pair (or the same one) from inside transferFrom.
contract ParvexReentrantToken is ParvexTestToken("Re", "RE", 18) {
    ParvexMandateSettler public target;
    ParvexMandateSettler.Order internal s;
    ParvexMandateSettler.Order internal b;
    bytes internal ss;
    bytes internal bs;
    bool public armed;
    bool public reentered;
    bytes public lastError;

    function arm(ParvexMandateSettler t, ParvexMandateSettler.Order calldata so, bytes calldata sSig, ParvexMandateSettler.Order calldata bo, bytes calldata bSig) external {
        target = t;
        s = so;
        b = bo;
        ss = sSig;
        bs = bSig;
        armed = true;
    }

    function transferFrom(address f, address to, uint256 v) public override returns (bool) {
        if (armed) {
            armed = false;
            reentered = true;
            try target.settle(s, ss, b, bs) {} catch (bytes memory e) {
                lastError = e;
            }
        }
        return super.transferFrom(f, to, v);
    }
}

/// balanceOf/allowance revert or burn gas: checkDeal must still answer.
contract ParvexHostileViewToken {
    function balanceOf(address) external pure returns (uint256) {
        revert("no");
    }

    function allowance(address, address) external view returns (uint256) {
        uint256 x;
        for (;;) x++;
    }
}

/// ERC-1271 wallet owned by one EOA.
contract ParvexTestWallet {
    address public owner;

    constructor(address o) {
        owner = o;
    }

    function approveToken(address token, address spender, uint256 v) external {
        require(msg.sender == owner, "owner");
        ParvexTestToken(token).approve(spender, v);
    }

    function approveOrder(ParvexMandateSettler desk, ParvexMandateSettler.Order calldata o) external {
        require(msg.sender == owner, "owner");
        desk.approveOrder(o);
    }

    function isValidSignature(bytes32 h, bytes calldata sig) external view returns (bytes4) {
        if (sig.length != 65) return 0xffffffff;
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        return ecrecover(h, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
