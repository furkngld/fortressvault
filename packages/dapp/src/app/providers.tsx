'use client';

import { Web3ModalConnectorContextProvider } from "@bch-wc2/web3modal-connector";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Web3ModalConnectorContextProvider
      config={{
        projectId: 'b89a472ca74470463e1c16f3f6bfba4f',
        useChipnet: true,
      } as any}
    >
      {children}
    </Web3ModalConnectorContextProvider>
  );
}
