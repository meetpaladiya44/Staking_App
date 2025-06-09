'use client';

import { useState, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useWaitForTransactionReceipt } from '@worldcoin/minikit-react';
import { createPublicClient, http } from 'viem';
import { CONTRACT_ADDRESSES, WORLD_STAKING_ABI } from '../constants/contracts';
import { formatBigInt } from '../../utils/format';
import { simulatePriceMovement } from '../../utils/tradeSimulator';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

type ActiveTrade = {
  user: `0x${string}`;
  stakeIndex: number;
  amount: bigint;
  tradingAmount: bigint;
  currentTradeValue: bigint;
  id: string;
  currentValue: bigint;
  profitLoss: number;
};

// World Chain Mainnet configuration
const worldChainMainnet = {
  id: 480,
  name: 'World Chain',
  network: 'worldchain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    public: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] },
    default: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] },
  },
  blockExplorers: {
    default: { name: 'World Chain Explorer', url: 'https://worldscan.org/' },
  },
  testnet: false,
};

export default function AdminPage() {
  const { data: session } = useSession();
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTrade, setUpdatingTrade] = useState<string | null>(null);
  const [exitingTrade, setExitingTrade] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Setup viem client for World Chain
  const client = createPublicClient({
    chain: worldChainMainnet,
    transport: http('https://worldchain-mainnet.g.alchemy.com/public'),
  });

  // Monitor transaction status
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    client: client,
    appConfig: {
      app_id: process.env.NEXT_PUBLIC_APP_ID || '<your_app_id>',
    },
    transactionId: transactionId,
  });

  // Get wallet address from session
  useEffect(() => {
    const fetchWalletAddress = async () => {
      if (session?.user?.username) {
        try {
          const user = await MiniKit.getUserByUsername(`${session.user.username}`);
          console.log("Admin user fetched:", user);
          if (user?.walletAddress) {
            setWalletAddress(user.walletAddress);
          }
        } catch (error) {
          // Fallback for testing
          setWalletAddress('0xd53d5705924491cdf52e00db9920599090243486');
          console.error('Error fetching admin wallet address:', error);
        }
      }
    };
    fetchWalletAddress();
  }, [session?.user?.username]);

  // Refresh data when transaction is confirmed
  useEffect(() => {
    if (isConfirmed) {
      loadActiveTrades();
      setTransactionId('');
    }
  }, [isConfirmed]);

  // Load active trades
  const loadActiveTrades = async () => {
    try {
      setLoading(true);
      const trades: ActiveTrade[] = [];

      // Get all users with active stakes from events (simplified approach)
      const stakedEvents = await client.getLogs({
        address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
        event: {
          type: 'event',
          name: 'Staked',
          inputs: [
            { type: 'address', name: 'user', indexed: true },
            { type: 'uint256', name: 'amount' },
            { type: 'uint256', name: 'tradingAmount' },
            { type: 'uint256', name: 'timestamp' }
          ]
        },
        fromBlock: 'earliest'
      });

      // Process each user's stakes
      const processedUsers = new Set<string>();

      for (const event of stakedEvents) {
        const user = event.args.user as `0x${string}`;

        // Skip if we've already processed this user
        if (processedUsers.has(user)) continue;
        processedUsers.add(user);

        // Get stake count for this user
        const stakeCount = await client.readContract({
          address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
          abi: WORLD_STAKING_ABI,
          functionName: 'getStakeCount',
          args: [user]
        }) as bigint;

        // Check each stake
        for (let i = 0; i < Number(stakeCount); i++) {
          try {
            // Get stake details
            const stakeDetails = await client.readContract({
              address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
              abi: WORLD_STAKING_ABI,
              functionName: 'getStakeDetails',
              args: [user, BigInt(i)]
            }) as any[];

            const active = stakeDetails[6] as boolean;
            const tradeActive = stakeDetails[4] as boolean;

            if (active && tradeActive) {
              trades.push({
                user,
                stakeIndex: i,
                amount: stakeDetails[0] as bigint,
                tradingAmount: stakeDetails[2] as bigint,
                currentTradeValue: stakeDetails[3] as bigint,
                id: `${user}-${i}`,
                currentValue: stakeDetails[3] as bigint,
                profitLoss: 0
              });
            }
          } catch (err) {
            console.error(`Error processing stake ${i} for user ${user}:`, err);
          }
        }
      }

      // Add id and calculate profitLoss for each trade
      const processedTrades = trades.map(trade => {
        const profitLoss = Number(trade.currentTradeValue) - Number(trade.tradingAmount);
        const profitLossPercentage = (profitLoss / Number(trade.tradingAmount)) * 100;

        return {
          ...trade,
          profitLoss: Number(profitLossPercentage.toFixed(2))
        };
      });

      setActiveTrades(processedTrades);
    } catch (err) {
      console.error('Error loading active trades:', err);
      setError('Failed to load active trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      loadActiveTrades();
    }
  }, [walletAddress]);

  // Handle updating a trade value
  const handleUpdateTradeValue = async (trade: ActiveTrade) => {
    if (!walletAddress) {
      setError('Admin wallet not connected');
      return;
    }

    try {
      setError(null);
      setUpdatingTrade(`${trade.user}-${trade.stakeIndex}`);

      // Generate a new trade value
      const newValue = simulatePriceMovement(trade.currentTradeValue);

      // Send transaction using MiniKit
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.WORLD_STAKING,
            abi: WORLD_STAKING_ABI,
            functionName: 'updateTradeValue',
            args: [trade.user, BigInt(trade.stakeIndex), newValue.toString()],
          },
        ],
      });

      if (finalPayload.status === 'error') {
        console.error('Error sending update trade transaction:', finalPayload);
        setError('Failed to send update trade transaction');
      } else {
        console.log('Update trade transaction sent:', finalPayload.transaction_id);
        setTransactionId(finalPayload.transaction_id);

        // Update the local state
        setActiveTrades(prevTrades =>
          prevTrades.map(t =>
            (t.user === trade.user && t.stakeIndex === trade.stakeIndex)
              ? { ...t, currentTradeValue: newValue }
              : t
          )
        );
      }

    } catch (err: any) {
      console.error('Error updating trade value:', err);
      if (err.message?.includes('user_rejected') || err.message?.includes('cancelled')) {
        setError('Transaction was cancelled by user');
      } else {
        setError(`Failed to update trade value: ${err.message}`);
      }
    } finally {
      setUpdatingTrade(null);
    }
  };

  // Handle exiting a trade with hardcoded values
  const handleExitTrade = async (trade: ActiveTrade, profitable: boolean) => {
    if (!walletAddress) {
      setError('Admin wallet not connected');
      return;
    }

    try {
      setError(null);
      setExitingTrade(`${trade.user}-${trade.stakeIndex}`);

      // Calculate final value based on whether we want it to be profitable
      let finalValue = trade.currentTradeValue;

      if (profitable) {
        // Make it profitable (10-20% profit)
        const profitPercentage = 10 + Math.random() * 10;
        finalValue = trade.tradingAmount + BigInt(Math.floor(Number(trade.tradingAmount) * profitPercentage / 100));
      } else {
        // Make it unprofitable (0-10% loss)
        const lossPercentage = Math.random() * 10;
        finalValue = trade.tradingAmount - BigInt(Math.floor(Number(trade.tradingAmount) * lossPercentage / 100));
      }

      // Send transaction using MiniKit
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.WORLD_STAKING,
            abi: WORLD_STAKING_ABI,
            functionName: 'exitTrade',
            args: [trade.user, BigInt(trade.stakeIndex), finalValue.toString()],
          },
        ],
      });

      if (finalPayload.status === 'error') {
        console.error('Error sending exit trade transaction:', finalPayload);
        setError('Failed to send exit trade transaction');
      } else {
        console.log('Exit trade transaction sent:', finalPayload.transaction_id);
        setTransactionId(finalPayload.transaction_id);

        // Remove from active trades
        setActiveTrades(prevTrades =>
          prevTrades.filter(t =>
            !(t.user === trade.user && t.stakeIndex === trade.stakeIndex)
          )
        );
      }

    } catch (err: any) {
      console.error('Error exiting trade:', err);
      if (err.message?.includes('user_rejected') || err.message?.includes('cancelled')) {
        setError('Transaction was cancelled by user');
      } else {
        setError(`Failed to exit trade: ${err.message}`);
      }
    } finally {
      setExitingTrade(null);
    }
  };

  // Handle exiting a trade at current value (set by cron job)
  const handleExitTradeAtCurrentValue = async (trade: ActiveTrade) => {
    if (!walletAddress) {
      setError('Admin wallet not connected');
      return;
    }

    try {
      setError(null);
      setExitingTrade(`${trade.user}-${trade.stakeIndex}`);

      // Exit at the current trade value that was set by the cron job
      const finalValue = trade.currentTradeValue;

      console.log(`Exiting trade at current value: ${finalValue} (set by cron job)`);

      // Send transaction using MiniKit
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.WORLD_STAKING,
            abi: WORLD_STAKING_ABI,
            functionName: 'exitTrade',
            args: [trade.user, BigInt(trade.stakeIndex), finalValue.toString()],
          },
        ],
      });

      if (finalPayload.status === 'error') {
        console.error('Error sending exit trade transaction:', finalPayload);
        setError('Failed to send exit trade transaction');
      } else {
        console.log('Exit trade transaction sent:', finalPayload.transaction_id);
        setTransactionId(finalPayload.transaction_id);

        // Remove from active trades
        setActiveTrades(prevTrades =>
          prevTrades.filter(t =>
            !(t.user === trade.user && t.stakeIndex === trade.stakeIndex)
          )
        );
      }

    } catch (err: any) {
      console.error('Error exiting trade at current value:', err);
      if (err.message?.includes('user_rejected') || err.message?.includes('cancelled')) {
        setError('Transaction was cancelled by user');
      } else {
        setError(`Failed to exit trade at current value: ${err.message}`);
      }
    } finally {
      setExitingTrade(null);
    }
  };

  // Handle updating all trade values
  const handleUpdateAllTradeValues = async () => {
    if (!walletAddress) {
      setError('Admin wallet not connected');
      return;
    }

    try {
      setError(null);
      setIsUpdating(true);

      // Update each trade value
      for (const trade of activeTrades) {
        await handleUpdateTradeValue(trade);
      }
    } catch (err: any) {
      console.error('Error updating all trade values:', err);
      setError(`Failed to update all trade values: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle exiting all trades
  const handleExitAllTrades = async () => {
    if (!walletAddress) {
      setError('Admin wallet not connected');
      return;
    }

    try {
      setError(null);
      setIsExiting(true);

      // Exit each trade at current value
      for (const trade of activeTrades) {
        await handleExitTradeAtCurrentValue(trade);
      }
    } catch (err: any) {
      console.error('Error exiting all trades:', err);
      setError(`Failed to exit all trades: ${err.message}`);
    } finally {
      setIsExiting(false);
    }
  };

  // Handle force profit exit
  const handleForceProfitExit = async () => {
    if (!walletAddress) {
      setError('Admin wallet not connected');
      return;
    }

    try {
      setError(null);
      setIsExiting(true);

      // Exit each trade with profit
      for (const trade of activeTrades) {
        await handleExitTrade(trade, true);
      }
    } catch (err: any) {
      console.error('Error forcing profit exit:', err);
      setError(`Failed to force profit exit: ${err.message}`);
    } finally {
      setIsExiting(false);
    }
  };

  // Handle force loss exit
  const handleForceLossExit = async () => {
    if (!walletAddress) {
      setError('Admin wallet not connected');
      return;
    }

    try {
      setError(null);
      setIsExiting(true);

      // Exit each trade with loss
      for (const trade of activeTrades) {
        await handleExitTrade(trade, false);
      }
    } catch (err: any) {
      console.error('Error forcing loss exit:', err);
      setError(`Failed to force loss exit: ${err.message}`);
    } finally {
      setIsExiting(false);
    }
  };

  // Show transaction confirmation status
  const showTransactionStatus = transactionId && (isConfirming || isConfirmed);

  if (!session?.user?.username) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Admin Access Required</h1>
          <p className="text-gray-600 mb-6">Please log in to access the admin dashboard</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-neutral-900">
      <div className="max-w-7xl mx-auto py-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            👨‍💼 Admin Dashboard
          </h1>
          <p className="text-neutral-400 text-lg">Manage staking operations and monitor trades</p>
        </div>

        {/* Main Card */}
        <div className="bg-neutral-800 rounded-2xl shadow-xl border border-neutral-700 overflow-hidden">
          {/* Transaction Status */}
          {showTransactionStatus && (
            <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-xl">
              <div className="flex items-center gap-3">
                {isConfirming && (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-400 border-t-transparent"></div>
                    <div>
                      <p className="font-medium text-blue-400">Processing Transaction...</p>
                      <p className="text-sm text-blue-300">Please wait while we execute the admin action</p>
                    </div>
                  </>
                )}
                {isConfirmed && (
                  <>
                    <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                    <div>
                      <p className="font-medium text-green-400">Transaction Confirmed!</p>
                      <p className="text-sm text-green-300">Admin action completed successfully</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="font-medium text-red-400">Error</p>
                  <p className="text-sm text-red-300">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-300 transition-colors p-1 hover:bg-red-900/50 rounded-full"
                >
                  <span className="text-xl">×</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="p-2">
            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-neutral-700 rounded-xl p-4 border border-neutral-600 hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-semibold text-white mb-3">📊 Update Trade Value</h3>
                <p className="text-neutral-400 text-sm mb-4">Update the current value of active trades</p>
                <button
                  onClick={handleUpdateAllTradeValues}
                  disabled={isUpdating || isExiting || isConfirming}
                  className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 border-2 ${isUpdating || isConfirming
                    ? 'bg-neutral-600 text-neutral-500 cursor-not-allowed border-neutral-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 hover:border-blue-700'
                    }`}
                >
                  {isUpdating ? 'Updating...' : 'Update All'}
                </button>
              </div>

              <div className="bg-neutral-700 rounded-xl p-4 border border-neutral-600 hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-semibold text-white mb-3">🔄 Exit Trades</h3>
                <p className="text-neutral-400 text-sm mb-4">Exit trades at current market value</p>
                <button
                  onClick={handleExitAllTrades}
                  disabled={isUpdating || isExiting || isConfirming}
                  className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 border-2 ${isExiting || isConfirming
                    ? 'bg-neutral-600 text-neutral-500 cursor-not-allowed border-neutral-500'
                    : 'bg-purple-600 text-white hover:bg-purple-700 border-purple-600 hover:border-purple-700'
                    }`}
                >
                  {isExiting ? 'Exiting...' : 'Exit All'}
                </button>
              </div>

              <div className="bg-neutral-700 rounded-xl p-4 border border-neutral-600 hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-semibold text-white mb-3">📈 Force Profit</h3>
                <p className="text-neutral-400 text-sm mb-4">Force exit with profit (0-10%)</p>
                <button
                  onClick={handleForceProfitExit}
                  disabled={isUpdating || isExiting || isConfirming}
                  className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 border-2 ${isExiting || isConfirming
                    ? 'bg-neutral-600 text-neutral-500 cursor-not-allowed border-neutral-500'
                    : 'bg-green-600 text-white hover:bg-green-700 border-green-600 hover:border-green-700'
                    }`}
                >
                  {isExiting ? 'Exiting...' : 'Force Profit'}
                </button>
              </div>

              <div className="bg-neutral-700 rounded-xl p-4 border border-neutral-600 hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-semibold text-white mb-3">📉 Force Loss</h3>
                <p className="text-neutral-400 text-sm mb-4">Force exit with loss (0-10%)</p>
                <button
                  onClick={handleForceLossExit}
                  disabled={isUpdating || isExiting || isConfirming}
                  className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 border-2 ${isExiting || isConfirming
                    ? 'bg-neutral-600 text-neutral-500 cursor-not-allowed border-neutral-500'
                    : 'bg-red-600 text-white hover:bg-red-700 border-red-600 hover:border-red-700'
                    }`}
                >
                  {isExiting ? 'Exiting...' : 'Force Loss'}
                </button>
              </div>
            </div>

            {/* Active Trades Table */}
            <div className="bg-neutral-700 rounded-xl border border-neutral-600 overflow-hidden">
              <div className="p-4 border-b border-neutral-600">
                <h3 className="text-lg font-semibold text-white">Active Trades</h3>
                <p className="text-neutral-400 text-sm">Monitor and manage current trading positions</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-600">
                      <th className="text-left py-4 px-4 font-semibold text-neutral-300">User</th>
                      <th className="text-left py-4 px-4 font-semibold text-neutral-300">Stake #</th>
                      <th className="text-left py-4 px-4 font-semibold text-neutral-300">Amount</th>
                      <th className="text-left py-4 px-4 font-semibold text-neutral-300">Trading</th>
                      <th className="text-left py-4 px-4 font-semibold text-neutral-300">Current Value</th>
                      <th className="text-left py-4 px-4 font-semibold text-neutral-300">P/L</th>
                      <th className="text-left py-4 px-4 font-semibold text-neutral-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTrades.map((trade) => (
                      <tr key={trade.id} className="border-b border-neutral-600 last:border-0">
                        <td className="py-4 px-4 text-neutral-300">{trade.user.slice(0, 6)}...{trade.user.slice(-4)}</td>
                        <td className="py-4 px-4 text-neutral-300">#{trade.stakeIndex}</td>
                        <td className="py-4 px-4 text-neutral-300">{formatBigInt(trade.amount)} WST</td>
                        <td className="py-4 px-4 text-neutral-300">{formatBigInt(trade.tradingAmount)} WST</td>
                        <td className="py-4 px-4 text-neutral-300">{formatBigInt(trade.currentValue)} WST</td>
                        <td className="py-4 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${trade.profitLoss >= 0
                            ? 'bg-green-900/50 text-green-400 border border-green-700'
                            : 'bg-red-900/50 text-red-400 border border-red-700'
                            }`}>
                            {trade.profitLoss >= 0 ? '+' : ''}{trade.profitLoss}%
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateTradeValue(trade)}
                              disabled={isUpdating || isExiting || isConfirming}
                              className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 border-2 ${isUpdating || isConfirming
                                ? 'bg-neutral-600 text-neutral-500 cursor-not-allowed border-neutral-500'
                                : 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 hover:border-blue-700'
                                }`}
                            >
                              {isUpdating ? 'Updating...' : '📊 Update'}
                            </button>
                            <button
                              onClick={() => handleExitTradeAtCurrentValue(trade)}
                              disabled={isUpdating || isExiting || isConfirming}
                              className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 border-2 ${isExiting || isConfirming
                                ? 'bg-neutral-600 text-neutral-500 cursor-not-allowed border-neutral-500'
                                : 'bg-purple-600 text-white hover:bg-purple-700 border-purple-600 hover:border-purple-700'
                                }`}
                            >
                              🔄 Exit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Info Section */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-700 rounded-xl p-6 border border-neutral-600">
                <h3 className="text-lg font-semibold text-white mb-4">📋 Admin Guidelines</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-blue-900/50 text-blue-400 rounded-full flex items-center justify-center text-xs font-semibold border border-blue-700">📊</span>
                    <div>
                      <p className="font-medium text-white">Update Value</p>
                      <p className="text-neutral-400">Updates current trade value</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-purple-900/50 text-purple-400 rounded-full flex items-center justify-center text-xs font-semibold border border-purple-700">🔄</span>
                    <div>
                      <p className="font-medium text-white">Exit Current</p>
                      <p className="text-neutral-400">Exits at current market value</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-green-900/50 text-green-400 rounded-full flex items-center justify-center text-xs font-semibold border border-green-700">📈</span>
                    <div>
                      <p className="font-medium text-white">Force Profit</p>
                      <p className="text-neutral-400">Forces profitable exit (0-10% gain)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-red-900/50 text-red-400 rounded-full flex items-center justify-center text-xs font-semibold border border-red-700">📉</span>
                    <div>
                      <p className="font-medium text-white">Force Loss</p>
                      <p className="text-neutral-400">Forces losing exit (0-10% loss)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-700 rounded-xl p-6 border border-neutral-600">
                <h3 className="text-lg font-semibold text-white mb-4">⚙️ System Information</h3>
                <div className="space-y-3 text-sm text-neutral-400">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400">🌍</span>
                    <span>Transactions processed via World App</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400">🔒</span>
                    <span>Admin functions require proper permissions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">⛓️</span>
                    <span>Operations confirmed on World Chain</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400">⚡</span>
                    <span>Real-time trade monitoring and control</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 