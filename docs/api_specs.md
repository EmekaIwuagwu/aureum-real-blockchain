# Aureum Chain JSON-RPC API Specifications

All communication between the UIs (Wallet/Explorer) and the Aureum Node will use JSON-RPC over HTTP.

## Standard Methods

### `aureum_getBalance`
Returns the balance of the native AUR token for an address.
- **Params**: `[address: String]`
- **Returns**: `String` (Hex-encoded balance)

### `aureum_sendTransaction`
Submits a signed transaction to the network.
- **Params**: `[transaction: Object]`
- **Returns**: `String` (Transaction Hash)

### `aureum_getBlockByNumber`
Returns block details by height.
- **Params**: `[blockNumber: Number, fullTx: Boolean]`
- **Returns**: `Object` (Block data)

## Real Estate & Compliance Methods

### `aureum_getPropertyTokenMetadata`
Retrieves details about a tokenized property.
- **Params**: `[tokenId: String]`
- **Returns**: 
  ```json
  {
    "name": "Lisbon Luxury Villa",
    "valuation": "500000",
    "currency": "EUR",
    "visa_program": "Portugal-D7",
    "holding_period_months": 60,
    "current_yield_apy": "4.5",
    "image_url": "..."
  }
  ```

### `aureum_queryComplianceStatus`
Checks if an address is KYC-verified and compliant with specific jurisdiction rules.
- **Params**: `[address: String, jurisdiction: String]`
- **Returns**: 
  ```json
  {
    "is_compliant": true,
    "kyc_expiry": "2027-01-01",
    "restrictions": []
  }
  ```

### `aureum_getPropertyYields`
Returns the historical rental yield distribution for a property.
- **Params**: `[tokenId: String]`
- **Returns**: `Array<Object>`

## Staking & Governance

### `aureum_getStakeInfo`
- **Params**: `[address: String]`
- **Returns**: `Object`

### `aureum_getValidators`
Returns list of active authority nodes and PoS validators.
