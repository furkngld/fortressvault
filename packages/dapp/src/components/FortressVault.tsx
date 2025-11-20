"use client";

import { IConnector } from "@bch-wc2/interfaces";
import { useState, useEffect } from "react";
import { Contract, ElectrumNetworkProvider, TransactionBuilder, placeholderP2PKHUnlocker, placeholderPublicKey, placeholderSignature } from "cashscript";
import { WrapBuilder } from "@bch-wc2/cashscript-signer";
import artifact from "../../../contracts/artifacts/FortressVault.json";
import { decodeCashAddress, binToHex, hexToBin } from "@bitauth/libauth";
import { Wallet, TestNetWallet } from "mainnet-js";
import { Web3ModalConnector } from "@bch-wc2/web3modal-connector";

interface FortressVaultProps {
    address?: string;
    connector?: IConnector;
    showError: (message: string) => void;
    showInfo: (message: string) => void;
}

type Unit = 'BCH' | 'SATS';

export default function FortressVault({ address, connector, showError, showInfo }: FortressVaultProps) {
    const [rescuerAddress, setRescuerAddress] = useState<string>("");
    const [limitAmountInput, setLimitAmountInput] = useState<string>("10000");
    const [limitUnit, setLimitUnit] = useState<Unit>('SATS');
    const [vaultAddress, setVaultAddress] = useState<string>("");
    const [vaultBalance, setVaultBalance] = useState<number>(0);
    const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");
    const [withdrawUnit, setWithdrawUnit] = useState<Unit>('SATS');
    const [loading, setLoading] = useState<boolean>(false);
    const [contract, setContract] = useState<Contract | null>(null);
    const [provider, setProvider] = useState<ElectrumNetworkProvider | null>(null);
    const [copied, setCopied] = useState<boolean>(false);
    const [isScanningRegistry, setIsScanningRegistry] = useState<boolean>(false);
    const [registryScanError, setRegistryScanError] = useState<string | null>(null);
    const [registryFound, setRegistryFound] = useState<boolean>(false);
    const [registryTimestamp, setRegistryTimestamp] = useState<number | null>(null);
    const [storedRescuerPkh, setStoredRescuerPkh] = useState<Uint8Array | null>(null);
    const [rescuerConnectedAddress, setRescuerConnectedAddress] = useState<string | null>(null);
    const [rescuerConnector, setRescuerConnector] = useState<IConnector | null>(null);
    const [showRescuerConnectModal, setShowRescuerConnectModal] = useState<boolean>(false);
    const [rescuerWcUri, setRescuerWcUri] = useState<string>("");

    // Conversion helpers
    const toSatoshis = (amount: string, unit: Unit): bigint => {
        if (!amount || amount === '') return 0n;
        try {
            if (unit === 'BCH') {
                // Convert BCH to sats by multiplying by 100_000_000
                // Use string manipulation to avoid floating point errors
                const parts = amount.split('.');
                const whole = parts[0] || '0';
                const decimal = (parts[1] || '').padEnd(8, '0').slice(0, 8);
                return BigInt(whole + decimal);
            } else {
                return BigInt(Math.floor(Number(amount)));
            }
        } catch {
            return 0n;
        }
    };

    const fromSatoshis = (sats: bigint, unit: Unit): string => {
        if (unit === 'BCH') {
            const satsStr = sats.toString().padStart(9, '0');
            const whole = satsStr.slice(0, -8) || '0';
            const decimal = satsStr.slice(-8).replace(/0+$/, '');
            return decimal ? `${whole}.${decimal}` : whole;
        } else {
            return sats.toString();
        }
    };

    // Get limit in satoshis
    const getLimitInSats = (): bigint => {
        return toSatoshis(limitAmountInput, limitUnit);
    };

    // Convert limit amount when unit changes
    useEffect(() => {
        if (limitAmountInput && limitAmountInput !== '') {
            const sats = toSatoshis(limitAmountInput, limitUnit === 'BCH' ? 'SATS' : 'BCH');
            if (sats > 0n) {
                // Value is already in correct unit, no conversion needed
            }
        }
    }, [limitUnit]);

    // Convert withdraw amount when unit changes
    useEffect(() => {
        if (withdrawAmountInput && withdrawAmountInput !== '') {
            const sats = toSatoshis(withdrawAmountInput, withdrawUnit === 'BCH' ? 'SATS' : 'BCH');
            if (sats > 0n) {
                // Value is already in correct unit, no conversion needed
            }
        }
    }, [withdrawUnit]);

    // Get withdraw amount in satoshis
    const getWithdrawInSats = (): bigint => {
        return toSatoshis(withdrawAmountInput, withdrawUnit);
    };

    // Check if withdrawal exceeds limit
    const exceedsLimit = (): boolean => {
        if (!withdrawAmountInput) return false;
        return getWithdrawInSats() > getLimitInSats();
    };

    // Copy vault address to clipboard
    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(vaultAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    // Truncate address for display
    const truncateAddress = (addr: string): string => {
        if (addr.length <= 20) return addr;
        const prefix = addr.slice(0, 15);
        const suffix = addr.slice(-8);
        return `${prefix}...${suffix}`;
    };

    // Helper to convert address to PKH
    const addressToPkh = (address: string): Uint8Array => {
        try {
            const decoded = decodeCashAddress(address);
            if (typeof decoded === "string") {
                throw new Error(decoded);
            }
            return decoded.payload;
        } catch (error) {
            throw new Error(`Invalid address format: ${error}`);
        }
    };

    // Update vault balance
    const updateBalance = async (contractInstance: Contract) => {
        try {
            const balance = await contractInstance.getBalance();
            setVaultBalance(Number(balance));
        } catch (error: any) {
            console.error("Failed to fetch balance:", error);
        }
    };

    // Save vault configuration to chain with hardcoded P2PKH artifact
    const saveVaultToChain = async (limit: bigint, rescuerPkh: Uint8Array) => {
        if (!connector || !address || !provider) return;

        try {
            showInfo("Saving vault configuration to chain...");

            // Revert to addressToPkh for reliable 20-byte PKH
            const userPkh = addressToPkh(address);

            console.log("--- DEBUG INFO ---");
            console.log("User Address:", address);
            console.log("User PKH (Hex):", binToHex(userPkh));

            // Verify address decoding
            try {
                const decoded = decodeCashAddress(address);
                if (typeof decoded === 'string') {
                    console.error("Address decode failed:", decoded);
                } else {
                    console.log("Decoded Prefix:", decoded.prefix);
                    console.log("Decoded Type:", decoded.type);
                    console.log("Decoded Payload:", binToHex(decoded.payload));

                    if (decoded.prefix !== 'bchtest') {
                        console.warn("WARNING: Address prefix is not 'bchtest'. You might be connected to Mainnet instead of Chipnet.");
                    }
                }
            } catch (e) {
                console.error("Debug check failed:", e);
            }

            if (userPkh.length !== 20) {
                throw new Error(`Invalid PKH length: ${userPkh.length}. Expected 20.`);
            }

            const utxos = await provider.getUtxos(address);
            if (utxos.length === 0) throw new Error("No UTXOs to pay for registry transaction");

            const limitHex = limit.toString(16);
            const limitHexEven = limitHex.length % 2 === 0 ? limitHex : '0' + limitHex;

            const opReturnData = [
                "0x" + Buffer.from("FV1").toString('hex'),
                "0x" + limitHexEven,
                "0x" + binToHex(rescuerPkh)
            ];

            const builder = new TransactionBuilder({ provider })
                .addInputs(utxos, placeholderP2PKHUnlocker(address))
                .addOpReturnOutput(opReturnData)
                .addOutput({ to: address, amount: 1000n });

            const computeTxStats = () => {
                const raw = builder.build();
                const estimatedSize = BigInt(raw.length / 2);
                const inputSum = builder.inputs.reduce((sum, input) => sum + input.satoshis, 0n);
                const outputSum = builder.outputs.reduce((sum, output) => sum + output.amount, 0n);
                const fee = inputSum - outputSum;
                return { estimatedSize, inputSum, outputSum, fee };
            };

            const feeRatePerByte = 2n;
            const dustThreshold = 546n;
            const payoutIndex = builder.outputs.findIndex((output) => typeof output.to === 'string');
            if (payoutIndex === -1) {
                throw new Error('Failed to build registry transaction output');
            }

            // Ücret ayarlaması: Transaction boyutunu hesapla ve change output'unu güncelle
            const inputSum = builder.inputs.reduce((sum, input) => sum + input.satoshis, 0n);
            
            // İlk tahmin ile transaction oluştur
            let rawTx = builder.build();
            let txSize = BigInt(rawTx.length / 2);
            let targetFee = txSize * feeRatePerByte;
            
            // Change output'u ayarla (OP_RETURN + 1 değer output var, value output index 1)
            const opReturnCount = 1; // OP_RETURN output sayısı
            const valueOutputIndex = opReturnCount; // İlk değer output'u
            
            let newChangeAmount = inputSum - targetFee - 1000n; // 1000n minimum output amount
            
            if (newChangeAmount < dustThreshold) {
                throw new Error('Insufficient balance to cover registry fee. Please fund your wallet.');
            }
            
            builder.outputs[valueOutputIndex].amount = newChangeAmount;
            
            // Final transaction'ı yeniden oluştur
            rawTx = builder.build();
            txSize = BigInt(rawTx.length / 2);
            targetFee = txSize * feeRatePerByte;
            
            // Son düzeltme
            newChangeAmount = inputSum - targetFee - 1000n;
            if (newChangeAmount < dustThreshold) {
                throw new Error('Insufficient balance to cover registry fee. Please fund your wallet.');
            }
            builder.outputs[valueOutputIndex].amount = newChangeAmount;

            const result = await WrapBuilder(builder, connector).send({
                userPrompt: "Sign Vault Registry Transaction",
                broadcast: true
            });

            console.log("Registry TX broadcast:", result.txid);
            showInfo("Vault configuration saved!");
            setRegistryFound(true);
            setRegistryTimestamp(Date.now());

        } catch (error: any) {
            console.error("Failed to save vault:", error);
            showError(`Failed to save registry: ${error.message}`);
        }
    };

    // Scan history for Vault Registry transaction
    const scanForVault = async (wallet: Wallet, networkProvider: ElectrumNetworkProvider) => {
        if (!address) return;

        try {
            setIsScanningRegistry(true);
            setRegistryScanError(null);

            const historyResponse = await wallet.provider.getHistory(address);
            const history = Array.isArray(historyResponse) ? [...historyResponse] : [];
            history.sort((a: any, b: any) => (b?.height || 0) - (a?.height || 0));

            let latestRegistryMatch: null | {
                limitVal: number;
                rescuerPkhHex: string;
                height: number;
                timestampMs: number;
                txHash: string;
            } = null;

            for (const tx of history) {
                try {
                    const txHash = (tx as any)?.tx_hash || (tx as any)?.txid || (tx as any)?.hash;
                    if (!tx || !txHash) {
                        console.warn("Skipping transaction with missing transaction id", tx);
                        continue;
                    }

                    const rawTx = await wallet.provider.getRawTransaction(txHash);
                    const rawTxHex = rawTx.toLowerCase();

                    if (rawTxHex.includes("6a03465631")) {
                        console.log("Found Vault Registry TX:", txHash);

                        const verboseTx: any = await wallet.provider.getRawTransaction(txHash, true);

                        for (const output of verboseTx.vout) {
                            if (output.scriptPubKey.asm.startsWith("OP_RETURN")) {
                                const hexData = output.scriptPubKey.hex.toLowerCase();

                                if (hexData.startsWith("6a03465631")) {
                                    let cursor = 10;

                                    const limitLenHex = hexData.substring(cursor, cursor + 2);
                                    const limitLen = parseInt(limitLenHex, 16);
                                    cursor += 2;
                                    const limitHex = hexData.substring(cursor, cursor + (limitLen * 2));
                                    const limitVal = parseInt(limitHex.match(/../g)?.reverse().join('') || '0', 16);
                                    cursor += (limitLen * 2);

                                    const pkhLenHex = hexData.substring(cursor, cursor + 2);
                                    const pkhLen = parseInt(pkhLenHex, 16);
                                    cursor += 2;
                                    const rescuerPkhHex = hexData.substring(cursor, cursor + (pkhLen * 2));

                                    if (pkhLen === 20) {
                                        const txHeight = typeof (tx as any)?.height === 'number' ? (tx as any).height : -1;
                                        const rawTimestampSec = typeof verboseTx?.blocktime === 'number'
                                            ? verboseTx.blocktime
                                            : typeof verboseTx?.time === 'number'
                                                ? verboseTx.time
                                                : Math.floor(Date.now() / 1000);
                                        const timestampMs = rawTimestampSec * 1000;

                                        const shouldReplace = () => {
                                            if (!latestRegistryMatch) return true;
                                            if (timestampMs > latestRegistryMatch.timestampMs) return true;
                                            if (timestampMs === latestRegistryMatch.timestampMs) {
                                                if (txHeight > latestRegistryMatch.height) return true;
                                                if (txHeight === latestRegistryMatch.height && txHash > latestRegistryMatch.txHash) {
                                                    return true;
                                                }
                                            }
                                            return false;
                                        };

                                        if (shouldReplace()) {
                                            latestRegistryMatch = {
                                                limitVal,
                                                rescuerPkhHex,
                                                height: txHeight,
                                                timestampMs,
                                                txHash,
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (txError: any) {
                    console.warn(`Skipping invalid transaction: ${txError.message}`);
                    continue;
                }
            }
            if (latestRegistryMatch) {
                const ownerPkh = addressToPkh(address!);
                const rescuerPkh = hexToBin(latestRegistryMatch.rescuerPkhHex);

                const contractInstance = new Contract(
                    artifact,
                    [ownerPkh, rescuerPkh, BigInt(latestRegistryMatch.limitVal)],
                    { provider: networkProvider }
                );

                setContract(contractInstance);
                setRegistryFound(true);
                setRegistryTimestamp(latestRegistryMatch.timestampMs);
                setVaultAddress(contractInstance.address);
                setVaultBalance(0);
                setLimitAmountInput(latestRegistryMatch.limitVal.toString());
                setStoredRescuerPkh(rescuerPkh);
                setRescuerAddress("(Loaded from Chain)");

                const timestampLabel = new Date(latestRegistryMatch.timestampMs).toLocaleString();
                showInfo(`Vault loaded from registry (tx ${latestRegistryMatch.txHash}) on ${timestampLabel}`);
                await updateBalance(contractInstance);
            } else {
                setRegistryFound(false);
                setRegistryTimestamp(null);
            }
        } catch (error) {
            console.error("Failed to scan for vault:", error);
            setRegistryScanError((error as Error).message ?? 'Failed to scan registry');
            setRegistryFound(false);
            setRegistryTimestamp(null);
        } finally {
            setIsScanningRegistry(false);
        }
    };

    // Initialize network provider and scan for vault
    useEffect(() => {
        if (!address) return;

        (async () => {
            try {
                const wallet = await TestNetWallet.watchOnly(address);
                const networkProvider = new ElectrumNetworkProvider("chipnet", {
                    electrum: wallet.provider.electrum,
                    manualConnectionManagement: true,
                });
                setProvider(networkProvider);

                await scanForVault(wallet, networkProvider);
            } catch (error: any) {
                console.error("Failed to initialize provider:", error);
            }
        })();
    }, [address]);

    // Create vault contract instance
    const createVault = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!address || !rescuerAddress || !provider) {
            showError("Please connect wallet and enter rescuer address");
            return;
        }

        const limitSats = getLimitInSats();
        const minLimit = 1000n;
        if (limitSats <= 0n) {
            showError("Withdrawal limit must be greater than 0");
            return;
        }
        if (limitSats < minLimit) {
            showError(`Withdrawal limit must be at least ${minLimit} satoshis (0.00001 BCH) to cover transaction fees and registry costs.`);
            return;
        }

        try {
            setLoading(true);

            const ownerPkh = addressToPkh(address);
            const rescuerPkh = rescuerAddress === "(Loaded from Chain)" && storedRescuerPkh
                ? storedRescuerPkh
                : addressToPkh(rescuerAddress);

            const contractInstance = new Contract(
                artifact,
                [ownerPkh, rescuerPkh, limitSats],
                { provider }
            );

            setContract(contractInstance);
            setVaultAddress(contractInstance.address);
            showInfo(`Vault created at: ${contractInstance.address}`);

            await saveVaultToChain(limitSats, rescuerPkh);
            await updateBalance(contractInstance);
        } catch (error: any) {
            showError(`Failed to create vault: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Withdraw function
    const withdraw = async () => {
        if (!contract || !connector || !provider) {
            showError("Please create vault and connect wallet first");
            return;
        }

        const withdrawSats = getWithdrawInSats();
        const limitSats = getLimitInSats();
        const dustThreshold = 546n;
        const feeRatePerByte = 2n;

        if (withdrawSats <= 0n) {
            showError("Withdrawal amount must be greater than 0");
            return;
        }

        if (withdrawSats > limitSats) {
            showError(`Withdrawal amount exceeds limit of ${fromSatoshis(limitSats, 'SATS')} satoshis`);
            return;
        }

        if (withdrawSats < dustThreshold) {
            showError(`Withdrawal amount must be at least ${dustThreshold} satoshis to avoid dust outputs.`);
            return;
        }

        if (vaultBalance === 0) {
            showError("Vault has no balance");
            return;
        }

        try {
            setLoading(true);

            const to = address!;

            const contractUtxos = await provider.getUtxos(contract.address);
            if (contractUtxos.length === 0) {
                showError("No UTXOs found in vault");
                return;
            }

            const inputsTotal = contractUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);

            // İlk tahmin: 2 input + 2 output için yaklaşık 400 byte
            const estimatedTxSize = 400n;
            const estimatedFee = estimatedTxSize * feeRatePerByte;
            let changeAmount = inputsTotal - withdrawSats - estimatedFee;

            if (changeAmount < dustThreshold) {
                throw new Error(`Vault balance insufficient. Need at least ${fromSatoshis(withdrawSats + estimatedFee + dustThreshold, 'SATS')} sats total (withdrawal + fee + change dust). Reduce withdrawal amount.`);
            }

            const builder = new TransactionBuilder({ provider })
                .addInputs(contractUtxos, contract.unlock.withdraw(placeholderPublicKey(), placeholderSignature(), withdrawSats))
                .addOutput({ to, amount: withdrawSats })
                .addOutput({ to: contract.address, amount: changeAmount });

            // Gerçek işlem boyutunu hesapla ve değişiklik çıktısını ayarla
            const rawTx = builder.build();
            const actualSize = BigInt(rawTx.length / 2);
            const actualFee = actualSize * feeRatePerByte;
            const finalChangeAmount = inputsTotal - withdrawSats - actualFee;

            if (finalChangeAmount < dustThreshold) {
                throw new Error('Insufficient balance after exact fee calculation. Reduce withdrawal amount.');
            }

            // Change çıktısını güncelle (index 1)
            builder.outputs[1].amount = finalChangeAmount;

            const result = await WrapBuilder(builder, connector).send({
                userPrompt: `Withdraw ${fromSatoshis(withdrawSats, 'BCH')} BCH from vault`,
                broadcast: false,
            });

            await provider.sendRawTransaction(result.signedTransaction);

            showInfo(`Withdrawal successful! TxID: ${result.txid}`);
            await updateBalance(contract);
        } catch (error: any) {
            showError(`Withdrawal failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Check if connected wallet is the rescuer
    const isRescuerConnected = (): boolean => {
        if (!rescuerConnectedAddress || !storedRescuerPkh) return false;
        try {
            const connectedPkh = addressToPkh(rescuerConnectedAddress);
            return binToHex(connectedPkh) === binToHex(storedRescuerPkh);
        } catch {
            return false;
        }
    };

    // Show rescuer connect modal
    const openRescuerConnectModal = () => {
        setShowRescuerConnectModal(true);
    };

    // Connect rescuer wallet with WalletConnect
    const connectRescuerWallet = async () => {
        try {
            if (!storedRescuerPkh) {
                showError("Rescuer information not available");
                return;
            }

            showInfo("Opening WalletConnect for rescuer wallet...");

            // Import necessary WalletConnect dependencies
            const { SignClient } = await import('@walletconnect/sign-client');
            const { Web3Modal } = await import('@web3modal/standalone');
            
            // Create separate SignClient for rescuer
            const rescuerSignClient = await SignClient.init({
                projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
                metadata: {
                    name: "FortressVault Rescuer",
                    description: "Emergency rescue wallet",
                    url: typeof window !== 'undefined' ? window.location.origin : '',
                    icons: []
                }
            });

            // Create separate Web3Modal for rescuer
            const rescuerWeb3Modal = new Web3Modal({
                projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
                standaloneChains: ['bch:bchtest'],
                walletConnectVersion: 2
            });

            // Create rescuer connector
            const rescuerConnectorInstance = new Web3ModalConnector({
                globalClient: rescuerSignClient,
                web3Modal: rescuerWeb3Modal,
                useChipnet: true
            });

            // Connect rescuer wallet
            await rescuerConnectorInstance.connect();
            
            // Get rescuer address
            const getAddress = async () => {
                const addr = await rescuerConnectorInstance.address();
                return addr;
            };
            
            const rescuerAddr = await getAddress();

            if (!rescuerAddr) {
                showError("Failed to get rescuer address");
                await rescuerConnectorInstance.disconnect();
                return;
            }

            // Verify rescuer PKH
            const connectedPkh = addressToPkh(rescuerAddr);
            if (binToHex(connectedPkh) !== binToHex(storedRescuerPkh)) {
                showError("Connected wallet does not match vault rescuer. Please connect the correct wallet.");
                await rescuerConnectorInstance.disconnect();
                return;
            }

            // Success
            setRescuerConnectedAddress(rescuerAddr);
            setRescuerConnector(rescuerConnectorInstance);
            setShowRescuerConnectModal(false);
            showInfo("Rescuer wallet connected successfully!");
        } catch (error: any) {
            console.error("Rescuer connection error:", error);
            showError(`Failed to connect rescuer: ${error.message}`);
        }
    };

    // Disconnect rescuer wallet
    const disconnectRescuerWallet = async () => {
        if (rescuerConnector) {
            try {
                await rescuerConnector.disconnect();
            } catch (error) {
                console.error("Error disconnecting rescuer:", error);
            }
        }
        setRescuerConnectedAddress(null);
        setRescuerConnector(null);
    };

    // Rescue function (panic button)
    const rescue = async () => {
        if (!contract || !provider) {
            showError("Please create vault first");
            return;
        }

        if (vaultBalance === 0) {
            showError("Vault has no balance");
            return;
        }

        if (!rescuerConnector || !rescuerConnectedAddress) {
            showError("Please connect rescuer wallet first");
            return;
        }

        if (!isRescuerConnected()) {
            showError("Connected wallet is not the rescuer wallet");
            return;
        }

        try {
            setLoading(true);

            // Get contract UTXOs
            const contractUtxos = await provider.getUtxos(contract.address);
            if (contractUtxos.length === 0) {
                showError("No UTXOs found in vault");
                return;
            }

            // Build transaction with placeholders
            const builder = new TransactionBuilder({ provider })
                .addInputs(contractUtxos, contract.unlock.rescue(placeholderPublicKey(), placeholderSignature()));

            // Calculate total and fee
            const inputSum = builder.inputs.reduce((sum, input) => sum + input.satoshis, 0n);
            const estimatedSize = BigInt(builder.build().length / 2 + 100); // Add extra for output
            const amountToSend = inputSum - estimatedSize;

            if (amountToSend <= 0n) {
                showError("Insufficient balance to rescue (fees exceed balance)");
                return;
            }

            // Add output to rescuer's connected address
            builder.addOutput({
                to: rescuerConnectedAddress,
                amount: amountToSend,
            });

            // Sign and broadcast using rescuer's connector
            const result = await WrapBuilder(builder, rescuerConnector).send({
                userPrompt: `RESCUE: Sweep all funds to rescuer address`,
                broadcast: false,
            });

            await provider.sendRawTransaction(result.signedTransaction);

            showInfo(`Rescue successful! All funds sent to rescuer. TxID: ${result.txid}`);
            await updateBalance(contract);
        } catch (error: any) {
            showError(`Rescue failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Refresh balance periodically
    useEffect(() => {
        if (contract) {
            const interval = setInterval(() => updateBalance(contract), 10000);
            return () => clearInterval(interval);
        }
    }, [contract]);

    if (contract) {
        return (
            <div className="w-full max-w-4xl mx-auto">
                <div className="bg-surface-dark/50 backdrop-blur-xl border border-gray-800 rounded-xl shadow-2xl shadow-black/30 p-8 sm:p-10">
                    <div className="flex justify-between items-start mb-8">
                        <div className="flex-1 mr-4">
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-2xl font-bold text-white">Vault Dashboard</h2>
                                {registryFound && (
                                    <span className="text-xs uppercase tracking-wide bg-emerald-900/50 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full">
                                        On-chain
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-gray-400 text-sm font-mono break-all">
                                    {truncateAddress(vaultAddress)}
                                </p>
                                <button
                                    onClick={copyAddress}
                                    className="text-indigo-400 hover:text-indigo-300 transition-colors"
                                    title="Copy full address"
                                >
                                    <span className="material-symbols-outlined text-sm">
                                        {copied ? 'check' : 'content_copy'}
                                    </span>
                                </button>
                            </div>
                            {copied && <p className="text-xs text-green-400 mt-1">Copied!</p>}
                            {registryFound && registryTimestamp && (
                                <p className="text-xs text-gray-500 mt-2">
                                    Rule created on {new Date(registryTimestamp).toLocaleString()}
                                </p>
                            )}
                            <button
                                onClick={() => {
                                    if (confirm("Changing rules requires moving funds to a new vault. Are you sure?")) {
                                        setContract(null);
                                        setRegistryFound(false);
                                        setRegistryTimestamp(null);
                                        setVaultAddress("");
                                        setRescuerAddress("");
                                        setStoredRescuerPkh(null);
                                    }
                                }}
                                className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-base">edit</span>
                                <span>Edit Vault Rules</span>
                            </button>
                        </div>
                        <div className="text-right">
                            <p className="text-gray-400 text-sm">Vault Balance</p>
                            <p className="text-3xl font-bold text-white">{(vaultBalance / 1e8).toFixed(8)} BCH</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Withdraw Section */}
                        <div className="space-y-6 p-6 bg-gray-900/50 rounded-xl border border-gray-800">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-green-400">arrow_downward</span>
                                <h3 className="text-xl font-bold text-white">Withdraw</h3>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-gray-400">
                                        Amount
                                    </label>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => setWithdrawUnit('BCH')}
                                            className={`px-2 py-0.5 text-xs rounded transition-colors ${withdrawUnit === 'BCH'
                                                ? 'bg-green-600 text-white'
                                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                        >
                                            BCH
                                        </button>
                                        <button
                                            onClick={() => setWithdrawUnit('SATS')}
                                            className={`px-2 py-0.5 text-xs rounded transition-colors ${withdrawUnit === 'SATS'
                                                ? 'bg-green-600 text-white'
                                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                        >
                                            SATS
                                        </button>
                                    </div>
                                </div>
                                <input
                                    className={`w-full bg-transparent border-0 border-b-2 ${exceedsLimit() ? 'border-red-500' : 'border-gray-700 focus:border-green-500'
                                        } focus:ring-0 transition-colors text-gray-200`}
                                    type="text"
                                    value={withdrawAmountInput}
                                    onChange={(e) => setWithdrawAmountInput(e.target.value)}
                                    placeholder={withdrawUnit === 'BCH' ? '0.00001' : '1000'}
                                    disabled={loading}
                                />
                                {exceedsLimit() ? (
                                    <p className="text-xs text-red-400 mt-1">
                                        Exceeds Vault Limit ({fromSatoshis(getLimitInSats(), withdrawUnit)} {withdrawUnit})
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Limit: {fromSatoshis(getLimitInSats(), withdrawUnit)} {withdrawUnit}
                                    </p>
                                )}
                            </div>

                            <button
                                onClick={withdraw}
                                disabled={loading || vaultBalance === 0 || exceedsLimit() || !withdrawAmountInput}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Processing..." : "Withdraw to Wallet"}
                            </button>
                        </div>

                        {/* Rescue Section */}
                        <div className="space-y-6 p-6 bg-red-900/20 rounded-xl border border-red-900/50">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-red-400">emergency</span>
                                <h3 className="text-xl font-bold text-red-400">Emergency Rescue</h3>
                            </div>

                            <p className="text-sm text-gray-400">
                                Rescuer wallet must be verified to sweep all funds. This bypasses all withdrawal limits.
                            </p>

                            {rescuerConnectedAddress && isRescuerConnected() ? (
                                <>
                                    <div className="text-sm text-green-400 break-all font-mono flex items-center gap-2">
                                        <span className="material-symbols-outlined text-xs">check_circle</span>
                                        <span>Rescuer Verified: {truncateAddress(rescuerConnectedAddress)}</span>
                                    </div>
                                    <button
                                        onClick={rescue}
                                        disabled={loading || vaultBalance === 0}
                                        className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined">warning</span>
                                        {loading ? "Rescuing..." : "Rescue All Funds"}
                                    </button>
                                    <button
                                        onClick={disconnectRescuerWallet}
                                        className="w-full text-gray-400 hover:text-gray-300 text-sm transition-colors"
                                    >
                                        Disconnect Rescuer
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-sm text-gray-500 break-all font-mono">
                                        {rescuerAddress === "(Loaded from Chain)" ? "Rescuer: (From Chain)" : `Rescuer: ${truncateAddress(rescuerAddress)}`}
                                    </div>
                                    <button
                                        onClick={openRescuerConnectModal}
                                        disabled={loading || !storedRescuerPkh}
                                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined">account_circle</span>
                                        {loading ? "Connecting..." : "Verify Rescuer Wallet"}
                                    </button>
                                    <p className="text-xs text-gray-500 text-center">
                                        Only the rescuer can perform emergency withdrawals
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Rescuer Connect Modal */}
                {showRescuerConnectModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold text-white">Connect Rescuer Wallet</h3>
                                <button
                                    onClick={() => {
                                        setShowRescuerConnectModal(false);
                                    }}
                                    className="text-gray-400 hover:text-gray-300"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm text-gray-400">
                                    To perform a rescue operation, connect the rescuer wallet using WalletConnect.
                                </p>

                                <div className="bg-amber-900/30 border border-amber-600/60 rounded-lg p-3">
                                    <p className="text-xs text-amber-200">
                                        <span className="font-semibold">Important:</span> Make sure you connect the wallet that was set as the rescuer when this vault was created.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowRescuerConnectModal(false)}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2 px-4 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={connectRescuerWallet}
                                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                                    Connect Wallet
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (isScanningRegistry) {
        return (
            <div className="w-full max-w-3xl mx-auto text-center bg-surface-dark/60 border border-gray-800 rounded-2xl p-10 shadow-2xl shadow-black/30">
                <div className="flex flex-col items-center gap-4">
                    <span className="material-symbols-outlined text-4xl text-indigo-300 animate-pulse">sync</span>
                    <h2 className="text-2xl font-semibold text-white">Scanning for existing vault rules…</h2>
                    <p className="text-gray-400 max-w-xl">
                        We are syncing your on-chain registry entries to make sure we do not create duplicate vault rules. This usually takes a few seconds.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-16 items-center">
            <div className="lg:col-span-3">
                <div className="bg-surface-dark/50 backdrop-blur-xl border border-gray-800 rounded-xl shadow-2xl shadow-black/30">
                    <div className="p-8 sm:p-10">
                        <div className="flex items-center gap-3 mb-2">
                            <img
                                alt="FortressVault logo"
                                className="h-7 w-7"
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCwCkrjzh2fpdZg9zG6y_knPkqRyUaPXwS9Xyd5ILwpuXM3ifuKZSl6Z2dlKoy0YYCWms8REvUtQQVlYe057INWq0IyeU509wBUobN1j6EpiVCdM8MQwMymXhKaiucmSSAKer3k3fb5_cz47_PuxizsT1DZNqsbnd4fhBduwSmd4o8kcBE_OuHVUelYolRljL_RklQXA1pQ2jkxQQB5FI0_ORp90SqHrBb5PiVf9pZDLVft4ghAcKQq7Qb938QJ0Ds4L9cgIbA6lIe_"
                            />
                            <h2 className="text-2xl font-bold text-white">Create Your Vault</h2>
                        </div>
                        <p className="text-gray-400 mb-8">
                            Secure your Bitcoin Cash with non-custodial withdrawal limits.
                        </p>

                        {registryScanError && (
                            <div className="mb-6 p-3 rounded-lg border border-amber-600/60 bg-amber-900/30 text-amber-200 text-sm">
                                Unable to confirm existing rules automatically: {registryScanError}. You can still create a new vault below if you are sure no registry exists.
                            </div>
                        )}

                        <form className="space-y-8" onSubmit={createVault}>
                            <div>
                                <label
                                    className="block text-sm font-medium text-gray-400 mb-2"
                                    htmlFor="rescuer-address"
                                >
                                    Rescuer Address (Cold Wallet)
                                </label>
                                <div className="relative">
                                    <input
                                        className="w-full bg-transparent border-0 border-b-2 border-gray-700 focus:border-primary-DEFAULT focus:ring-0 transition-colors text-gray-200 placeholder:text-gray-600 pb-2"
                                        id="rescuer-address"
                                        name="rescuer-address"
                                        placeholder="Enter your secure bchtest: address"
                                        type="text"
                                        value={rescuerAddress}
                                        onChange={(e) => setRescuerAddress(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label
                                        className="block text-sm font-medium text-gray-400"
                                        htmlFor="withdrawal-limit"
                                    >
                                        Withdrawal Limit
                                    </label>
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setLimitUnit('BCH')}
                                            className={`px-2 py-0.5 text-xs rounded transition-colors ${limitUnit === 'BCH'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                        >
                                            BCH
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLimitUnit('SATS')}
                                            className={`px-2 py-0.5 text-xs rounded transition-colors ${limitUnit === 'SATS'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                        >
                                            SATS
                                        </button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <input
                                        className="w-full bg-transparent border-0 border-b-2 border-gray-700 focus:border-primary-DEFAULT focus:ring-0 transition-colors text-gray-200"
                                        id="withdrawal-limit"
                                        name="withdrawal-limit"
                                        type="text"
                                        value={limitAmountInput}
                                        onChange={(e) => setLimitAmountInput(e.target.value)}
                                        placeholder={limitUnit === 'BCH' ? '0.0001' : '10000'}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    className="w-full flex items-center justify-center gap-2 bg-primary-DEFAULT text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-dark focus:ring-primary-DEFAULT transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    type="submit"
                                    disabled={loading || !address}
                                >
                                    {loading ? "Creating..." : "Create Vault"}
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-2">
                <div className="space-y-6 text-gray-400">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-indigo-400">shield_lock</span>
                            <h3 className="font-bold text-gray-200">Enhanced Security</h3>
                        </div>
                        <p className="text-sm">
                            Your vault is non-custodial. Only you have access to your keys and your funds, always.
                        </p>
                    </div>

                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-indigo-400">account_balance_wallet</span>
                            <h3 className="font-bold text-gray-200">Withdrawal Limits</h3>
                        </div>
                        <p className="text-sm">
                            Set a maximum withdrawal amount to protect against unauthorized large transactions.
                        </p>
                    </div>

                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-indigo-400">emergency</span>
                            <h3 className="font-bold text-gray-200">Panic Button</h3>
                        </div>
                        <p className="text-sm">
                            In an emergency, instantly sweep all funds to your pre-defined secure rescuer address.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
