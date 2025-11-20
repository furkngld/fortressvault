"use client";

import ConnectButton from "@/components/ConnectButton";
import FinishTransactionModal from "@/components/FinishTransactionModal";
import FortressVault from "@/components/FortressVault";
import { IConnector, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import { useCallback, useMemo, useState } from "react";
import { useWatchAddress } from "@/hooks/useWatchAddress";

export default function Home() {
  const { connector, address, disconnect } = useWeb3ModalConnectorContext();
  const { balance } = useWatchAddress(address || "");

  const wrappedConnector = useMemo(() => connector ? {
    ...connector,
    signTransaction: async (options: WcSignTransactionRequest) => {
      setShowFinishTransactionModal(true);
      setFinishTransactionMessage(options.userPrompt || "Sign transaction");
      try {
        if (typeof options.transaction === "string") {
          options.transaction = decodeTransaction(hexToBin(options.transaction));
        }
        const result = await connector.signTransaction(options);
        return result;
      } catch (e: any) {
        console.error(e);
        showError(`Unable to sign transaction: ${e.message}`);
      } finally {
        setShowFinishTransactionModal(false);
        setFinishTransactionMessage("");
      }
    },
  } : undefined as IConnector | undefined, [connector]);


  const [showFinishTransactionModal, setShowFinishTransactionModal] = useState<boolean>(false);
  const [finishTransactionMessage, setFinishTransactionMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  const showError = useCallback((message: string) => {
    setError(message);
    setTimeout(() => setError(""), 10000);
  }, []);

  const showInfo = useCallback((message: string) => {
    setInfo(message);
    setTimeout(() => setInfo(""), 10000);
  }, []);

  return (
    <div className="font-display bg-background-dark text-gray-300 antialiased"
      style={{
        backgroundImage: "radial-gradient(circle at top right, rgba(79, 70, 229, 0.1), transparent 40%), radial-gradient(circle at bottom left, rgba(79, 70, 229, 0.1), transparent 50%)"
      }}>
      {showFinishTransactionModal && <FinishTransactionModal
        onClose={() => setShowFinishTransactionModal(false)}
        message={finishTransactionMessage}
      ></FinishTransactionModal>}
      {(error.length > 0 || info.length > 0) &&
        <div className={`fixed z-40 top-0 flex justify-center w-full py-3`}>
          {error.length > 0 && <div onClick={() => setError("")} className="break-all md:break-normal mx-3 mb-4 rounded-lg border-red-300 border-solid border-2 bg-red-100 px-6 py-5 text-base text-red-700" role="alert">{error}</div>}
          {info.length > 0 && <div onClick={() => setInfo("")} className="break-all md:break-normal mx-3 mb-4 rounded-lg border-green-300 border-solid border-2 bg-green-100 px-6 py-5 text-base text-green-700" role="alert">{info}</div>}
        </div>
      }

      <div className="flex flex-col min-h-screen">
        <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img
                alt="FortressVault logo"
                className="h-10 w-10"
                src="/fortress-logo.svg"
              />
              <h1 className="text-2xl font-bold text-white">FortressVault</h1>
            </div>
            <div className="flex items-center gap-6 text-sm">
              {address && (
                <div className="text-right hidden sm:block">
                  <p className="text-gray-200 truncate max-w-xs">{address}</p>
                  <p className="text-gray-400">
                    Balance: <span className="font-medium text-gray-200">{((balance ?? 0) / 1e8).toFixed(4)} BCH</span>
                  </p>
                </div>
              )}
              {address ? (
                <button
                  onClick={disconnect}
                  className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <ConnectButton />
              )}
            </div>
          </nav>
        </header>

        <main className="flex-grow flex items-center justify-center p-4">
          <FortressVault
            address={address}
            connector={wrappedConnector}
            showError={showError}
            showInfo={showInfo}
          />
        </main>
      </div>
    </div>
  );
}
