// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title RealEstateToken
 * @dev A production-grade fractionalized real estate token for Aureum.
 */
contract RealEstateToken {
    string public propertyAddress;
    uint256 public valuationEur;
    address public owner;

    // Roles
    address public registrar;
    address public complianceOfficer;
    address public oracle;

    mapping(address => uint256) public shares;
    mapping(address => bool) public whitelist;
    uint256 public constant TOTAL_SHARES = 10000; // 100.00% in bps
    bool public paused;

    event SharesTransferred(
        address indexed from,
        address indexed to,
        uint256 amount
    );
    event ValuationUpdated(uint256 newValuation);
    event WhitelistUpdated(address indexed account, bool status);
    event Paused(bool status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Authorized: Owner only");
        _;
    }

    modifier onlyCompliance() {
        require(msg.sender == complianceOfficer, "Authorized: Compliance only");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Authorized: Oracle only");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    constructor(
        string memory _propertyAddress,
        uint256 _valuationEur,
        address _registrar,
        address _compliance
    ) {
        owner = msg.sender;
        propertyAddress = _propertyAddress;
        valuationEur = _valuationEur;
        registrar = _registrar;
        complianceOfficer = _compliance;
        shares[msg.sender] = TOTAL_SHARES;
        whitelist[msg.sender] = true;
    }

    function setOracle(address _oracle) public onlyOwner {
        oracle = _oracle;
    }

    function updateValuation(uint256 _newValuation) public onlyOracle {
        valuationEur = _newValuation;
        emit ValuationUpdated(_newValuation);
    }

    function setWhitelisted(
        address account,
        bool status
    ) public onlyCompliance {
        whitelist[account] = status;
        emit WhitelistUpdated(account, status);
    }

    function setPaused(bool _paused) public onlyCompliance {
        paused = _paused;
        emit Paused(_paused);
    }

    function transferShares(address to, uint256 amount) public whenNotPaused {
        require(whitelist[msg.sender], "Sender not whitelisted");
        require(whitelist[to], "Receiver not whitelisted");
        require(shares[msg.sender] >= amount, "Insufficient shares");

        shares[msg.sender] -= amount;
        shares[to] += amount;

        emit SharesTransferred(msg.sender, to, amount);
    }

    function redeemShares(uint256 amount) public whenNotPaused {
        require(shares[msg.sender] >= amount, "Insufficient shares");
        // In reality, this would trigger a payment out of the treasury or property sale
        shares[msg.sender] -= amount;
    }

    function getShare(address addr) public view returns (uint256) {
        return shares[addr];
    }
}
