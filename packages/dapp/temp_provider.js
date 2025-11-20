import { jsx as _jsx } from "react/jsx-runtime";
import Client from "@walletconnect/sign-client";
import { getAppMetadata } from "@walletconnect/utils";
import { Web3Modal } from "@web3modal/standalone";
import { useState, useCallback, useMemo, useEffect } from "react";
import { DefaultDesktopWallets, DefaultWalletImages } from "../config/config";
import { Web3ModalConnectorContext } from "../contexts/Web3ModalConnectorContext";
import { Web3ModalConnector } from "../Web3ModalConnector";
let globalClient = undefined;
let web3Modal = undefined;
/**
 * Provider
 */
export const Web3ModalConnectorContextProvider = ({ children, config, }) => {
    const [connector, setConnector] = useState();
    const [isConnected, setIsConnected] = useState(false);
    const [address, setAddress] = useState(undefined);
    const connect = useCallback(async () => {
        if (isConnected) {
            return;
        }
        const connector = await createConnector(config);
        if (!connector) {
            return;
        }
        await connector.connect();
        setConnector(connector);
        localStorage.setItem("Web3ModalConnector", "active");
        setAddress(await connector.address());
        setIsConnected(true);
        connector.on("disconnect", async () => {
            setIsConnected(false);
            setAddress(undefined);
            localStorage.removeItem("Web3ModalConnector");
            setConnector(undefined);
        });
    }, [setConnector, setIsConnected, isConnected]);
    const connected = useCallback(() => {
        return connector.connected();
    }, [connector]);
    const disconnect = useCallback(async () => {
        await connector?.disconnect();
        localStorage.removeItem("Connector");
        setIsConnected(false);
        localStorage.removeItem("Web3ModalConnector");
        setAddress(undefined);
        setConnector(undefined);
    }, [connector, setIsConnected, setConnector]);
    const signTransaction = useCallback((options) => {
        return connector.signTransaction(options);
    }, [connector]);
    const signMessage = useCallback((options) => {
        return connector.signMessage(options);
    }, [connector]);
    const on = useCallback((event, callback) => {
        return connector.on(event, callback);
    }, [connector]);
    const createConnector = async (config) => {
        try {
            web3Modal = new Web3Modal({
                projectId: config.projectId,
                walletConnectVersion: 2,
                desktopWallets: config.desktopWallets || DefaultDesktopWallets,
                walletImages: config.walletImages || DefaultWalletImages,
                enableExplorer: false,
                enableAccountView: true,
                mobileWallets: [],
                explorerRecommendedWalletIds: "NONE",
            });
            if (!globalClient) {
                globalClient = await Client.init({
                    logger: config.logger,
                    relayUrl: config.relayUrl,
                    projectId: config.projectId,
                    metadata: config.metadata || getAppMetadata(),
                });
            }
            ;
            const connector = new Web3ModalConnector({
                useChipnet: config.useChipnet,
                globalClient,
                web3Modal,
                relayerRegion: config.relayUrl,
                logger: config.logger
            });
            return connector;
        }
        catch (err) {
            console.error("Error creating connector:", err);
            return undefined;
        }
    };
    useEffect(() => {
        if (localStorage.getItem("Web3ModalConnector") === "active") {
            connect();
        }
    }, [connect]);
    const value = useMemo(() => ({
        connector,
        isConnected,
        connect,
        connected,
        disconnect,
        address,
        on,
        signMessage,
        signTransaction,
    }), [
        connector,
        isConnected,
        connect,
        connected,
        disconnect,
        address,
        on,
        signMessage,
        signTransaction,
    ]);
    return (_jsx(Web3ModalConnectorContext.Provider, { value: {
            ...value,
        }, children: children }));
};
//# sourceMappingURL=Web3ModalConnectorProvider.js.map