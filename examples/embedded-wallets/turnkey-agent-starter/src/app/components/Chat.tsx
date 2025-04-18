import React, { useEffect, useState, useRef, useMemo } from "react";
import { marked } from "marked";
import { toast } from "sonner";
import axios from "axios";
import bs58 from "bs58";
import { TurnkeySigner } from "@turnkey/solana";
import { Icon } from "@iconify/react";
import { myProvider } from "../utils/provider";
import { generateText, type CoreMessage } from "ai";
import { SolanaAgentKit, createVercelAITools } from "solana-agent-kit";
import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  sendAndConfirmRawTransaction,
  SendOptions,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";
import TokenPlugin from "@solana-agent-kit/plugin-token";
// import DefiPlugin from "@solana-agent-kit/plugin-defi";

type AIChatProps = {
  selectedAccount: string | null;
  signer: TurnkeySigner | undefined;
};

export const AIChat: React.FC<AIChatProps> = ({ selectedAccount, signer }) => {
  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [godMode, setGodMode] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const solanaTools = useMemo(() => {
    if (selectedAccount && signer) {
      const wallet = selectedAccount;
      const agent = new SolanaAgentKit(
        {
          publicKey: new PublicKey(selectedAccount as string),
          signTransaction: async <T extends Transaction | VersionedTransaction>(
            tx: T
          ): Promise<T> => {
            console.log("sign transaction");
            if (!signer) throw new Error("Turnkey signer not initialized.");

            const signedTransaction = await signer.signTransaction(
              tx,
              selectedAccount
            );
            return signedTransaction as T;
          },
          signMessage: async (msg) => {
            console.log("sign message");
            if (!signer) throw new Error("Turnkey signer not initialized.");

            const signedMessage = await signer.signMessage(
              msg,
              selectedAccount
            );

            return signedMessage;
          },
          sendTransaction: async (tx) => {
            console.log("send transaction");

            if (!signer) throw new Error("Turnkey signer not initialized.");

            const connection = new Connection(
              process.env.NEXT_PUBLIC_RPC_URL as string,
              "confirmed"
            );
            const latestBlockHash = await connection.getLatestBlockhash();
            const sig = "version" in tx ? tx.signatures[0]! : tx.signature!;

            if (tx instanceof Transaction) {
              const signature = bs58.encode(sig as Uint8Array);

              const transactionHash = await sendAndConfirmRawTransaction(
                connection,
                tx.serialize(),
                {
                  blockhash: latestBlockHash.blockhash,
                  lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                  signature,
                },
                { commitment: "confirmed" }
              );
              return transactionHash;
            } else if (tx instanceof VersionedTransaction) {
              const signature = bs58.encode(sig as Uint8Array);
              const serialized = Buffer.from(tx.serialize());
              const transactionHash = await sendAndConfirmRawTransaction(
                connection,
                serialized,
                {
                  blockhash: latestBlockHash.blockhash,
                  lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                  signature,
                },
                { commitment: "confirmed" }
              );
              return transactionHash;
            } else {
              throw new Error("Error: while sending transaction");
            }
          },
          signAllTransactions: async <
            T extends Transaction | VersionedTransaction,
          >(
            txs: T[]
          ): Promise<T[]> => {
            console.log("sign all transaction");
            if (!signer) throw new Error("Turnkey signer not initialized.");

            const signedTransaction = await signer.signAllTransactions(
              txs,
              selectedAccount
            );
            return signedTransaction as T[];
          },
          signAndSendTransaction: async <
            T extends Transaction | VersionedTransaction,
          >(
            tx: T,
            options?: SendOptions
          ): Promise<{ signature: string }> => {
            console.log("sign and send transaction");
            if (!signer) throw new Error("Turnkey signer not initialized.");

            const signedTransaction = (await signer.signTransaction(
              tx,
              selectedAccount
            )) as T;

            const connection = new Connection(
              process.env.NEXT_PUBLIC_RPC_URL as string,
              "confirmed"
            );
            const latestBlockHash = await connection.getLatestBlockhash();
            const sig = "version" in tx ? tx.signatures[0]! : tx.signature!;

            if (tx instanceof Transaction) {
              const signature = bs58.encode(sig as Uint8Array);

              const transactionHash = await sendAndConfirmRawTransaction(
                connection,
                tx.serialize(),
                {
                  blockhash: latestBlockHash.blockhash,
                  lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                  signature,
                },
                { commitment: "confirmed" }
              );
              return { signature: transactionHash };
            } else if (tx instanceof VersionedTransaction) {
              const signature = bs58.encode(sig as Uint8Array);
              const serialized = Buffer.from(tx.serialize());
              const transactionHash = await sendAndConfirmRawTransaction(
                connection,
                serialized,
                {
                  blockhash: latestBlockHash.blockhash,
                  lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                  signature,
                },
                { commitment: "confirmed" }
              );
              return { signature: transactionHash };
            } else {
              throw new Error("Error: while sending transaction");
            }
          },
        },
        process.env.NEXT_PUBLIC_RPC_URL as string,
        {}
      ).use(TokenPlugin);
      // .use(DefiPlugin)

      const tools = createVercelAITools(agent, agent.actions);
      return tools;
    }
  }, [selectedAccount]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: CoreMessage = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const result = await generateText({
        model: myProvider.languageModel("chat-model"),
        messages: updatedMessages,
        system:
          "You're a helpful Solana assistant that helps people carry out transactions and actions on the Solana blockchain. You can only perform actions and answer questions related to Solana.",
        maxSteps: 5,
        tools: solanaTools,
      });

      console.log(result);

      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: result.text || "Sorry, I didn't quite get that.",
        },
      ]);
    } catch (error) {
      console.error("AI error:", error);
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Oops! Something went wrong.",
        },
      ]);
    }

    setIsLoading(false);
  };

  // Get current timestamp for messages
  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="w-full max-w-4xl flex flex-col h-[calc(100vh-24px)] mt-12 mx-auto px-4">
      <div className="flex-1 flex flex-col overflow-hidden rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-start justify-start h-full px-4 pt-24">
              <h1 className="text-4xl font-medium bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Welcome, Yash
              </h1>
              <p className="text-lg mt-3 bg-gradient-to-r from-gray-300 to-gray-400 bg-clip-text text-transparent">
                how can I help you?
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className="flex items-start justify-start">
                <div className="flex-shrink-0 mr-3">
                  <div
                    className={`${m.role === "user" ? "bg-[#2658DD] rounded-lg" : "bg-white rounded-lg" } flex items-center justify-center w-8 h-8`}
                  >
                    {m.role === "user" ? (
                      <img
                        src="/icons/user-icon.png"
                        alt="User"
                        className="object-contain w- h-6"
                      />
                    ) : (
                      <Icon
                        icon="solar:key-minimalistic-square-3-bold-duotone"
                        width="32"
                        height="32"
                        className="text-[#282c3a]"
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-start">
                  <div className="flex items-center mb-1">
                    <span className="text-xs text-gray-400 mr-2">
                      {m.role === "user" ? "You" : "Turnkey AI"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {getCurrentTime()}
                    </span>
                  </div>

                  <div
                    className={
                      m.role === "user"
                        ? "chat-message-user"
                        : "chat-message-ai"
                    }
                  >
                    {typeof m.content === "string" ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: marked(m.content) }}
                        className="prose prose-sm max-w-none"
                      />
                    ) : Array.isArray(m.content) ? (
                      m.content.map((part, idx) => {
                        if (typeof part === "string") {
                          return (
                            <div
                              key={idx}
                              dangerouslySetInnerHTML={{ __html: marked(part) }}
                              className="prose prose-sm max-w-none"
                            />
                          );
                        }
                        if ("text" in part && typeof part.text === "string") {
                          return (
                            <div
                              key={idx}
                              dangerouslySetInnerHTML={{
                                __html: marked(part.text),
                              }}
                              className="prose prose-sm max-w-none"
                            />
                          );
                        }
                        if ("url" in part && typeof part.url === "string") {
                          return (
                            <div className="my-2">
                              <img
                                key={idx}
                                src={part.url}
                                alt="AI image"
                                className="rounded-lg max-w-full object-cover shadow-lg"
                              />
                            </div>
                          );
                        }
                        return <span key={idx}>[Unsupported part]</span>;
                      })
                    ) : (
                      "[Unsupported content]"
                    )}
                  </div>

                  {m.role === "assistant" && (
                    <div className="flex space-x-2 mt-2">
                      <button className="text-gray-400 hover:text-white p-1 rounded transition-colors">
                        <Icon icon="solar:pen-bold" width="16" height="16" />
                      </button>
                      <button className="text-gray-400 hover:text-white p-1 rounded transition-colors">
                        <Icon icon="solar:like-bold" width="16" height="16" />
                      </button>
                      <button className="text-gray-400 hover:text-white p-1 rounded transition-colors">
                        <Icon
                          icon="solar:dislike-bold"
                          width="16"
                          height="16"
                        />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 p-2 relative">
          <div className="relative flex flex-col bg-gradient-to-br from-[#2B3542]/90 to-[#333D4A]/90 rounded-3xl border border-[#fafafa]/20 overflow-hidden">
            {/* Top part - input field */}
            <div className="w-full px-4 py-3">
              <textarea
                className="w-full min-h-[24px] bg-transparent border-none text-white placeholder-gray-400 focus:outline-none focus:ring-0 resize-none"
                placeholder="Ask me anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  (e.preventDefault(), handleSend())
                }
                disabled={isLoading}
              />
            </div>

            {/* Bottom part - icons and send button */}
            <div className="flex justify-between items-center px-4 py-2">
              {/* Left side icons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGodMode(!godMode)}
                  className="text-white opacity-70 hover:opacity-100 p-1 rounded transition-colors flex items-center gap-2"
                >
                  <div className="relative flex items-center">
                    <div
                      className={`w-8 h-4 rounded-full transition-colors ${godMode ? "bg-[#94959D]/70" : "bg-gray-600/40"}`}
                    >
                      <div
                        className={`absolute w-3 h-3 rounded-full bg-white shadow-md transform transition-transform ${godMode ? "translate-x-4" : "translate-x-1"}`}
                        style={{ top: "2px" }}
                      />
                    </div>
                  </div>
                  <span className="text-xs">God Mode</span>
                </button>
                <button className="text-white opacity-70 hover:opacity-100 p-1 rounded transition-colors">
                  <Icon icon="solar:upload-linear" width="20" height="20" />
                </button>
                <button className="text-white opacity-70 hover:opacity-100 p-1 rounded transition-colors">
                  <Icon icon="solar:link-bold" width="20" height="20" />
                </button>
                <button className="text-white opacity-70 hover:opacity-100 p-1 rounded transition-colors">
                  <Icon icon="solar:monitor-linear" width="20" height="20" />
                </button>
              </div>

              {/* Right side send button */}
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className=" text-white bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] rounded-full p-2 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <svg
                    className="animate-spin w-5 h-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <Icon
                    icon="solar:alt-arrow-right-bold-duotone"
                    width="24"
                    height="24"
                  />
                )}
              </button>
            </div>
          </div>
          <div className="text-center text-white text-md opacity-50 mt-4">
            Powered by Solana Agent Kit 2.0
          </div>
        </div>
      </div>

      {/* Bottom-left page links */}
      <div className="fixed bottom-12 left-12 flex items-center gap-4 text-white opacity-60 hover:opacity-90 transition-opacity">
        <a
          href="https://solana-agent-kit.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1"
        >
          <Icon icon="solar:notebook-square-bold" width="24" height="24" />
          <span>Docs</span>
          <Icon icon="solar:arrow-right-up-bold-duotone" width="16" height="16" />
        </a>
      </div>
    </div>
  );
};
