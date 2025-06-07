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
              });
            }
          } catch (err) {
            console.error(`Error processing stake ${i} for user ${user}:`, err);
          }
        }
      }
      
      setActiveTrades(trades);
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

  // Show transaction confirmation status
  const showTransactionStatus = transactionId && (isConfirming || isConfirmed);
  
  if (!session?.user?.username) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
        <div className="bg-gray-800 rounded-lg p-6">
          <p>Please log in to access the admin dashboard.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Trade Admin Dashboard</h1>
        <Link href="/" className="text-blue-400 hover:text-blue-300">
          Back to Home
        </Link>
      </div>

      {walletAddress && (
        <div className="mb-4 p-2 bg-gray-700 rounded text-sm">
          <p className="text-gray-300">
            Admin Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </p>
        </div>
      )}

      {/* Transaction Status */}
      {showTransactionStatus && (
        <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded">
          <div className="flex items-center space-x-2">
            {isConfirming && (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span className="text-blue-400 text-sm">Transaction confirming...</span>
              </>
            )}
            {isConfirmed && (
              <>
                <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                <span className="text-green-400 text-sm">Transaction confirmed!</span>
              </>
            )}
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-4 mb-4">
          <p>{error}</p>
          <button 
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-300 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}
      
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Active Trades</h2>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            <span className="ml-2 text-gray-400">Loading active trades...</span>
          </div>
        ) : activeTrades.length === 0 ? (
          <p>No active trades found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">Stake #</th>
                  <th className="text-left py-2">Amount</th>
                  <th className="text-left py-2">Trading Amount</th>
                  <th className="text-left py-2">Current Value</th>
                  <th className="text-left py-2">P/L</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeTrades.map((trade) => {
                  const tradeKey = `${trade.user}-${trade.stakeIndex}`;
                  const isUpdating = updatingTrade === tradeKey;
                  const isExiting = exitingTrade === tradeKey;
                  const profitLoss = Number(trade.currentTradeValue) - Number(trade.tradingAmount);
                  const profitLossPercentage = (profitLoss / Number(trade.tradingAmount)) * 100;
                  
                  return (
                    <tr key={tradeKey} className="border-b border-gray-700">
                      <td className="py-3 font-mono text-xs">
                        {`${trade.user.slice(0, 6)}...${trade.user.slice(-4)}`}
                      </td>
                      <td className="py-3">{trade.stakeIndex}</td>
                      <td className="py-3">{formatBigInt(trade.amount)} WST</td>
                      <td className="py-3">{formatBigInt(trade.tradingAmount)} WST</td>
                      <td className="py-3">{formatBigInt(trade.currentTradeValue)} WST</td>
                      <td className={`py-3 ${profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {profitLoss >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateTradeValue(trade)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-2 py-1 text-xs rounded ${
                              isUpdating || isConfirming
                                ? 'bg-blue-800 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {isUpdating ? 'Updating...' : 'Update Value'}
                          </button>
                          <button
                            onClick={() => handleExitTradeAtCurrentValue(trade)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-2 py-1 text-xs rounded ${
                              isExiting || isConfirming
                                ? 'bg-purple-800 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700'
                            }`}
                            title="Exit at the current value set by cron job"
                          >
                            Exit (Current)
                          </button>
                          <button
                            onClick={() => handleExitTrade(trade, true)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-2 py-1 text-xs rounded ${
                              isExiting || isConfirming
                                ? 'bg-green-800 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            Exit (Profit)
                          </button>
                          <button
                            onClick={() => handleExitTrade(trade, false)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-2 py-1 text-xs rounded ${
                              isExiting || isConfirming
                                ? 'bg-red-800 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            Exit (Loss)
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="mt-6">
          <button
            onClick={loadActiveTrades}
            disabled={loading}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh Trades'}
          </button>
        </div>
        
        <div className="mt-4 p-4 bg-gray-700/30 border border-gray-600 rounded">
          <h3 className="text-sm font-medium mb-2">Button Descriptions</h3>
          <div className="text-xs text-gray-400 space-y-1">
            <p><span className="text-blue-400">Update Value:</span> Randomly simulates price movement</p>
            <p><span className="text-purple-400">Exit (Current):</span> Exits trade at the current value set by the cron job signal processing</p>
            <p><span className="text-green-400">Exit (Profit):</span> Exits with hardcoded profit (10-20%)</p>
            <p><span className="text-red-400">Exit (Loss):</span> Exits with hardcoded loss (0-10%)</p>
          </div>
          
          <div className="mt-3 text-xs text-gray-400">
            <p>• All transactions are processed using World App</p>
            <p>• Admin functions require proper permissions</p>
            <p>• Transactions are confirmed on World Chain</p>
          </div>
        </div>
      </div>
    </div>
  );
} 