# Fund Wallet on DigitalOcean

**Wallet Address to Fund:** `A84f25d5ffd49077b52e68eb21465025681677a9e`

## SSH into your DigitalOcean droplet and run:

```bash
cd ~/aureum-real-blockchain
node fund-wallet.js A84f25d5ffd49077b52e68eb21465025681677a9e 1000000
```

This will send **1,000,000 AUR** tokens from the validator account to your wallet.

## Expected Output:
```
Funded address A84f25d5ffd49077b52e68eb21465025681677a9e Hash: A[transaction_hash]
```

## Check Balance After Funding:

Refresh your wallet at `http://139.59.214.243:3000` and you should see:
- Balance: **1,000,000 AUR**
- A transaction record in the "Recent Activity" section
