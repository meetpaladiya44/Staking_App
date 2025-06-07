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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
              ⚡ Trade Admin Dashboard
            </h1>
            <p className="text-gray-600 text-lg">Manage active trades and monitor performance</p>
          </div>
          <Link 
            href="/" 
            className="mt-4 md:mt-0 inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors font-medium"
          >
            <span>←</span> Back to Home
          </Link>
        </div>

        {/* Admin Wallet Status */}
        {walletAddress && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="font-medium text-green-800">Admin Wallet Connected</p>
                <p className="text-sm text-green-600 font-mono">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Status */}
        {showTransactionStatus && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-3">
              {isConfirming && (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                  <div>
                    <p className="font-medium text-blue-800">Processing Transaction...</p>
                    <p className="text-sm text-blue-600">Please wait while we execute the admin action</p>
                  </div>
                </>
              )}
              {isConfirmed && (
                <>
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <div>
                    <p className="font-medium text-green-800">Transaction Confirmed!</p>
                    <p className="text-sm text-green-600">Admin action completed successfully</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="text-red-500 text-xl">⚠️</span>
              <div className="flex-1">
                <p className="font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <span className="text-xl">×</span>
              </button>
            </div>
          </div>
        )}
        
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Active Trades Monitor</h2>
                <p className="text-gray-600">Manage and control user trading positions</p>
              </div>
              <button
                onClick={loadActiveTrades}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Refreshing...
                  </>
                ) : (
                  <>
                    🔄 Refresh Trades
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                <p className="text-gray-600">Loading active trades...</p>
              </div>
            ) : activeTrades.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">📈</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No Active Trades</h3>
                <p className="text-gray-600">All trades have been completed or no users are currently staking</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-4 px-2 font-semibold text-gray-700">User</th>
                        <th className="text-left py-4 px-2 font-semibold text-gray-700">Stake #</th>
                        <th className="text-left py-4 px-2 font-semibold text-gray-700">Amount</th>
                        <th className="text-left py-4 px-2 font-semibold text-gray-700">Trading</th>
                        <th className="text-left py-4 px-2 font-semibold text-gray-700">Current Value</th>
                        <th className="text-left py-4 px-2 font-semibold text-gray-700">P/L</th>
                        <th className="text-left py-4 px-2 font-semibold text-gray-700">Actions</th>
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
                          <tr key={tradeKey} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="py-4 px-2">
                              <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                {`${trade.user.slice(0, 6)}...${trade.user.slice(-4)}`}
                              </div>
                            </td>
                            <td className="py-4 px-2 font-semibold">{trade.stakeIndex}</td>
                            <td className="py-4 px-2 font-mono text-sm">{formatBigInt(trade.amount)} WST</td>
                            <td className="py-4 px-2 font-mono text-sm">{formatBigInt(trade.tradingAmount)} WST</td>
                            <td className="py-4 px-2 font-mono text-sm">{formatBigInt(trade.currentTradeValue)} WST</td>
                            <td className={`py-4 px-2 font-semibold ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {profitLoss >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%
                            </td>
                            <td className="py-4 px-2">
                              <div className="flex flex-wrap gap-1">
                                <button
                                  onClick={() => handleUpdateTradeValue(trade)}
                                  disabled={isUpdating || isExiting || isConfirming}
                                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                                    isUpdating || isConfirming
                                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  }`}
                                >
                                  {isUpdating ? 'Updating...' : 'Update'}
                                </button>
                                <button
                                  onClick={() => handleExitTradeAtCurrentValue(trade)}
                                  disabled={isUpdating || isExiting || isConfirming}
                                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                                    isExiting || isConfirming
                                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                  }`}
                                >
                                  Exit (Current)
                                </button>
                                <button
                                  onClick={() => handleExitTrade(trade, true)}
                                  disabled={isUpdating || isExiting || isConfirming}
                                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                                    isExiting || isConfirming
                                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                                  }`}
                                >
                                  Exit (Profit)
                                </button>
                                <button
                                  onClick={() => handleExitTrade(trade, false)}
                                  disabled={isUpdating || isExiting || isConfirming}
                                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                                    isExiting || isConfirming
                                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                      : 'bg-red-100 text-red-700 hover:bg-red-200'
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

                {/* Mobile Card View */}
                <div className="lg:hidden space-y-4">
                  {activeTrades.map((trade) => {
                    const tradeKey = `${trade.user}-${trade.stakeIndex}`;
                    const isUpdating = updatingTrade === tradeKey;
                    const isExiting = exitingTrade === tradeKey;
                    const profitLoss = Number(trade.currentTradeValue) - Number(trade.tradingAmount);
                    const profitLossPercentage = (profitLoss / Number(trade.tradingAmount)) * 100;
                    
                    return (
                      <div key={tradeKey} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">Stake #{trade.stakeIndex}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              profitLoss >= 0 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {profitLoss >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                          <div>
                            <p className="text-gray-600 mb-1">User</p>
                            <p className="font-mono bg-white px-2 py-1 rounded text-xs">
                              {`${trade.user.slice(0, 6)}...${trade.user.slice(-4)}`}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 mb-1">Amount</p>
                            <p className="font-mono">{formatBigInt(trade.amount)} WST</p>
                          </div>
                          <div>
                            <p className="text-gray-600 mb-1">Trading</p>
                            <p className="font-mono">{formatBigInt(trade.tradingAmount)} WST</p>
                          </div>
                          <div>
                            <p className="text-gray-600 mb-1">Current Value</p>
                            <p className="font-mono">{formatBigInt(trade.currentTradeValue)} WST</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleUpdateTradeValue(trade)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                              isUpdating || isConfirming
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            {isUpdating ? 'Updating...' : '📊 Update'}
                          </button>
                          <button
                            onClick={() => handleExitTradeAtCurrentValue(trade)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                              isExiting || isConfirming
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-600 text-white hover:bg-purple-700'
                            }`}
                          >
                            🔄 Exit Current
                          </button>
                          <button
                            onClick={() => handleExitTrade(trade, true)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                              isExiting || isConfirming
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          >
                            📈 Exit Profit
                          </button>
                          <button
                            onClick={() => handleExitTrade(trade, false)}
                            disabled={isUpdating || isExiting || isConfirming}
                            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                              isExiting || isConfirming
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                          >
                            📉 Exit Loss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🎮 Action Descriptions</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">📊</span>
                <div>
                  <p className="font-medium text-gray-800">Update Value</p>
                  <p className="text-gray-600">Randomly simulates market price movement</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-semibold">🔄</span>
                <div>
                  <p className="font-medium text-gray-800">Exit (Current)</p>
                  <p className="text-gray-600">Exits at current cron job processed value</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-semibold">📈</span>
                <div>
                  <p className="font-medium text-gray-800">Exit (Profit)</p>
                  <p className="text-gray-600">Forces profitable exit (10-20% gain)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs font-semibold">📉</span>
                <div>
                  <p className="font-medium text-gray-800">Exit (Loss)</p>
                  <p className="text-gray-600">Forces losing exit (0-10% loss)</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">⚙️ System Information</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-blue-500">🌍</span>
                <span>Transactions processed via World App</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500">🔒</span>
                <span>Admin functions require proper permissions</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-purple-500">⛓️</span>
                <span>Operations confirmed on World Chain</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-orange-500">⚡</span>
                <span>Real-time trade monitoring and control</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 