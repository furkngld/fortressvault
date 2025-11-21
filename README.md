<div align="center">
  <img src="packages/dapp/public/fortress-logo.svg" alt="FortressVault Logo" width="120" height="120">
  
  # 🏰 FortressVault
  
  ### Institutional-Grade Security for Your Personal Bitcoin Cash
  
  <img src="https://img.shields.io/badge/Network-CHIPNET-blue?style=for-the-badge" alt="Chipnet">
  <br/><br/>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![CashScript](https://img.shields.io/badge/CashScript-v0.12.0-green.svg)](https://cashscript.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
  
  **[Live Demo](https://fortressvault.vercel.app/) | [Documentation](#features) | [Smart Contract](packages/contracts/FortressVault.cash)**
</div>

---

<div align="center">
  <img src="https://github.com/user-attachments/assets/fae0f59c-ddc4-4774-b559-2958059b2b27" alt="FortressVault Dashboard" width="100%" style="border-radius: 10px; border: 1px solid #333;">
</div>

---

## 🎯 What is FortressVault?

FortressVault is a **non-custodial Bitcoin Cash (BCH) smart contract vault** that brings the security philosophy of cold wallets to your everyday spending wallet. It's designed for users who want the convenience of a hot wallet with the peace of mind of having unshakeable on-chain safety limits.

**Sleep soundly knowing your funds have a safety limit, even if your private key is stolen.**

### The Problem We Solve

💸 **Hot wallets are vulnerable** - One compromised device or malicious dApp can drain your entire balance instantly.  
🥶 **Cold wallets are inconvenient** - Moving funds in emergencies requires physical access to your hardware wallet.  
⚖️ **No middle ground exists** - Until now.

### The FortressVault Solution

✅ **Unbreakable Limits** - Set a maximum withdrawal amount per transaction. Even a hacker with your key cannot exceed this.  
✅ **On-Chain Memory** - We scan the blockchain to find your vault automatically. No databases, no login accounts.  
✅ **Panic Button** - Connect your cold wallet to bypass all limits and sweep funds instantly in an emergency.  
✅ **Fully Non-Custodial** - You hold your keys. We never have access to your funds.

---

## ⚡ Key Features

### 🧠 **Auto-Discovery Engine**
Forget about saving contract addresses or config files. FortressVault utilizes an **On-Chain Registry**.
*   **How it works:** When you connect your wallet, our dApp scans your transaction history on the Bitcoin Cash network.
*   **The Magic:** If you have created a rule before, we detect it instantly and load your vault interface. **Your settings live on the blockchain, not on our servers.**

### ❄️ **Cold Wallet Rescue Mode**
The ultimate failsafe. You can define a "Rescuer Address" (e.g., your Ledger or Trezor) when creating the vault.
*   **Scenario:** Your hot wallet is compromised.
*   **Action:** Connect your Rescuer Wallet to the dApp.
*   **Result:** The "Verify Rescuer" button activates, allowing you to **sweep 100% of funds** immediately, bypassing all withdrawal limits to save your assets.

### 🛡️ **Smart Contract Introspection**
Built on **CashScript**, utilizing Chipnet's advanced **Introspection Covenants**.
*   We mathematically enforce that any "change" (leftover funds) from a withdrawal **MUST** return to the exact same vault contract.
*   This ensures the security rules persist indefinitely, transaction after transaction.

### 🏭 **Zero-Cost Vault Creation**
Unlike EVM chains where deploying a smart wallet costs gas, FortressVault uses a **deterministic client-side factory pattern**. Creating a vault is completely free; the contract exists mathematically and is only deployed when funded.

---

## 🚀 How It Works

### 1️⃣ **Create Your Vault**
Define your safety rules. The app broadcasts a registry signal to the blockchain.
```typescript
// On-Chain Registry Signal
OP_RETURN ["FV1", limitHex, rescuerPkh]
```

### 2️⃣ **Fund & Forget**
Send BCH to your generated vault address. Your funds are now protected by the covenant.

### 3️⃣ **Daily Spending**
Withdraw funds up to your limit (e.g., 0.1 BCH).
*   **If amount ≤ Limit:** Transaction Approved ✅
*   **If amount > Limit:** Transaction Rejected by Network ❌

### 4️⃣ **Emergency Rescue**
Login with your Rescuer Wallet to override the protocol and retrieve everything.

---

## 🏗️ Technical Architecture

### Smart Contract (`FortressVault.cash`)
```plaintext
contract FortressVault(
    bytes20 ownerPkh,      // Hot wallet public key hash
    bytes20 rescuerPkh,    // Cold wallet public key hash  
    int limitAmount        // Maximum withdrawal per tx
)
```

**Key Constraints:**
- **Withdrawals:** Require exactly 2 outputs (payment + persistent change).
- **Covenants:** Uses `tx.outputs` and `lockingBytecode` to prevent funds from "leaking" out of the vault rules.
- **Rescue:** Uses signature verification of the `rescuerPkh` to unlock full access.

### Frontend Stack
- **Next.js 16** - React framework with App Router
- **TailwindCSS** - Modern, glassmorphism UI
- **@bch-wc2** - WalletConnect v2 integration for BCH
- **CashScript SDK** - Contract interaction & compilation
- **Electrum Network** - Real-time blockchain indexing

### Transaction Flow
```mermaid
graph LR
    A[User Request] --> B{Action Type?}
    B -->|Withdraw| C[Validate Limit]
    B -->|Rescue| D[Verify Rescuer]
    C --> E[Build Transaction]
    D --> E
    E --> F[WalletConnect Sign]
    F --> G[Broadcast to BCH]
    G --> H[Update Balance]
```

---

## 🔧 Project Structure

```
fortressvault/
├── packages/
│   ├── contracts/              # CashScript smart contracts
│   │   ├── FortressVault.cash  # Main vault contract
│   │   ├── artifacts/          # Compiled contract ABIs
│   │   └── test/               # Contract test suite
│   │
│   └── dapp/                   # Next.js frontend
│       ├── src/
│       │   ├── app/            # App router pages
│       │   ├── components/     # React components
│       │   │   └── FortressVault.tsx  # Main vault UI
│       │   └── hooks/          # Custom React hooks
│       └── public/
│           └── fortress-logo.svg  # Branding assets
│
├── package.json                # Monorepo root
└── README.md                   # You are here
```

---

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18+ and Yarn
- Bitcoin Cash testnet (Chipnet) wallet (Cashonize or Paytaca recommended)
- WalletConnect Project ID (Optional - [get one free](https://cloud.walletconnect.com/))

### Quick Start

```bash
# Clone the repository
git clone https://github.com/furkngld/fortressvault.git
cd fortressvault

# Install dependencies
yarn install

# Start development server
yarn workspace @dapp-starter/dapp dev
```

Visit `http://localhost:3000` and connect your Chipnet wallet!

---

## 🧪 Testing

```bash
# Run contract tests
yarn workspace @dapp-starter/contracts test
```

Test suite includes:
- ✅ Withdrawal limit enforcement
- ✅ Covenant output structure validation
- ✅ Rescue operation permissions
- ✅ PKH verification logic

---

## 🔐 Security Considerations

### ✅ What's Protected
- **Theft protection:** Attackers can't drain your wallet even with your private key.
- **Serverless:** No single point of failure. We don't store your data.
- **Cold Storage Backup:** Your rescuer key stays offline until you really need it.

### ⚠️ What to Know
- **Testnet only (Chipnet):** This is a prototype for BCH Blaze 2025.
- **Self-Custody:** You are responsible for your Rescuer Key. If you lose both keys, funds are lost.

---

## 🤝 Contributing

We welcome contributions! Areas where help is needed:
- 🐛 Bug reports and fixes
- 🎨 UI/UX enhancements
- 🔒 Security audits

**Development Workflow:**
1. Fork the repository
2. Create a feature branch
3. Submit a Pull Request

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 🙏 Acknowledgments

Built with love using:
- [CashScript](https://cashscript.org/) - Bitcoin Cash smart contract language
- [mainnet-js](https://mainnet.cash/) - BCH JavaScript library
- [WalletConnect](https://walletconnect.com/) - Wallet connection protocol

Special thanks to the **Bitcoin Cash Node** developers for enabling Introspection Opcodes.

---

## 📞 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/furkngld/fortressvault/issues)
- **Twitter**: [@furkngld](https://x.com/furkngld)

---

<div align="center">
  <strong>⚡ Built on Bitcoin Cash | 🔒 Secured by Smart Contracts | 💎 Owned by You</strong>
  <br/><br/>
  <p><i>If you find FortressVault useful, give us a ⭐ on GitHub!</i></p>
</div>
```
