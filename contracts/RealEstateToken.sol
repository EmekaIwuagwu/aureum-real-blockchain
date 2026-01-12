// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title RealEstateToken
 * @dev A fractionalized real estate token contract for Aureum
 */
contract RealEstateToken {
    string public propertyAddress;
    uint256 public valuationEur;
    address public owner;
    mapping(address => uint256) public shares;
    uint256 public constant TOTAL_SHARES = 10000; // 100.00% in bps

    event SharesTransferred(address indexed from, address indexed to, uint256 amount);

    constructor(string memory _propertyAddress, uint256 _valuationEur) {
        owner = msg.sender;
        propertyAddress = _propertyAddress;
        valuationEur = _valuationEur;
        shares[msg.sender] = TOTAL_SHARES;
    }

    function transferShares(address to, uint256 amount) public {
        require(shares[msg.sender] >= amount, "Insufficient shares");
        shares[msg.sender] -= amount;
        shares[to] += amount;
        emit SharesTransferred(msg.sender, to, amount);
    }

    function getShare(address addr) public view returns (uint256) {
        return shares[addr];
    }
}
