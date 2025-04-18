import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { TipLink } from "@tiplink/api";
import { SolanaAgentKit, signOrSendTX } from "solana-agent-kit";

const MINIMUM_SOL_BALANCE = 0.003 * LAMPORTS_PER_SOL;

export async function create_TipLink(
  agent: SolanaAgentKit,
  amount: number,
  splmintAddress?: PublicKey,
) {
  try {
    const tiplink = await TipLink.create();

    if (!splmintAddress) {
      const transaction = new Transaction();
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: agent.wallet.publicKey,
          toPubkey: tiplink.keypair.publicKey,
          lamports: amount * LAMPORTS_PER_SOL,
        }),
      );

      if (agent.config.signOnly) {
        return await agent.wallet.signTransaction(transaction);
      }
      const { blockhash } = await agent.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      const signature = (await signOrSendTX(agent, transaction)) as string;

      return {
        url: tiplink.url.toString(),
        signature,
      };
    } else {
      const fromAta = await getAssociatedTokenAddress(
        splmintAddress,
        agent.wallet.publicKey,
      );
      const toAta = await getAssociatedTokenAddress(
        splmintAddress,
        tiplink.keypair.publicKey,
      );

      const mintInfo = await getMint(agent.connection, splmintAddress);
      const adjustedAmount = amount * Math.pow(10, mintInfo.decimals);

      const transaction = new Transaction();

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 5000,
        }),
      );

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: agent.wallet.publicKey,
          toPubkey: tiplink.keypair.publicKey,
          lamports: MINIMUM_SOL_BALANCE,
        }),
      );

      transaction.add(
        createAssociatedTokenAccountInstruction(
          agent.wallet.publicKey,
          toAta,
          tiplink.keypair.publicKey,
          splmintAddress,
        ),
      );

      transaction.add(
        createTransferInstruction(
          fromAta,
          toAta,
          agent.wallet.publicKey,
          adjustedAmount,
        ),
      );

      if (agent.config.signOnly) {
        return await agent.wallet.signTransaction(transaction);
      }

      const { blockhash } = await agent.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      const signature = (await signOrSendTX(agent, transaction)) as string;

      return {
        url: tiplink.url.toString(),
        signature,
      };
    }
  } catch (error: any) {
    console.error("Error creating TipLink or sending funds:", error.message);
    throw new Error(`Failed to create TipLink: ${error.message}`);
  }
}
