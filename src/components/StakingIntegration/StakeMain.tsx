'use client';
import React, { useState, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useWaitForTransactionReceipt } from '@worldcoin/minikit-react';
import { createPublicClient, http } from 'viem';
import { worldchain } from 'viem/chains';
import { CONTRACT_ADDRESSES, ERC20_ABI, WORLD_STAKING_ABI } from '../constants/contracts';
import { formatBigInt } from '../../utils/format';
import { useSession } from 'next-auth/react'
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
  
// Add interface for stake details
interface StakeDetails {
  amount: bigint;
  timestamp: bigint;
  tradingAmount: bigint;
  currentTradeValue: bigint;
  tradeActive: boolean;
  claimableRewards: bigint;
  active: boolean;
  index: number;
}

export function StakingFormMain() {
  const { data: session } = useSession()
  const [amount, setAmount] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [permit2Allowance, setPermit2Allowance] = useState<bigint>(BigInt(0));
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  
  // Add new state for withdrawal functionality
  const [stakes, setStakes] = useState<StakeDetails[]>([]);
  const [isWithdrawing, setIsWithdrawing] = useState<{ [key: number]: boolean }>({});
  const [isLoadingStakes, setIsLoadingStakes] = useState(false);
  const [activeTab, setActiveTab] = useState<'stake' | 'withdraw'>('stake');

  // Setup viem client for World Chain
  const client = createPublicClient({
    chain: worldChainMainnet,
    transport: http('https://worldchain-mainnet.g.alchemy.com/public'),
  });
  // Monitor transaction status
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    client: client,
    appConfig: {
      app_id: process.env.NEXT_PUBLIC_APP_ID || '<your_app_id>', // Replace with your actual app_id
    },
    transactionId: transactionId,
  });
  useEffect(() => {
    const fetchWalletAddress = async () => {
      if (session?.user?.username) {
        try {
          const user = await MiniKit.getUserByUsername(`${session.user.username}`);
          console.log("aa gaya user wait krne ke bad", user);
          if (user?.walletAddress) {
            // setWalletAddress(user.walletAddress);
            setWalletAddress('0xd53d5705924491cdf52e00db9920599090243486');
            // Fetch balance and allowance after getting wallet address
            fetchBalanceAndAllowance();
          }
        } catch (error) {
            setWalletAddress('0xd53d5705924491cdf52e00db9920599090243486');
          console.error('Error fetching wallet address:', error);
          setError('Failed to fetch wallet address');
        }
      }
    };
    fetchWalletAddress();
  }, [session?.user?.username]); // Dependency on session username
  // Refresh data when transaction is confirmed
  useEffect(() => {
    if (isConfirmed) {
      fetchBalanceAndAllowance();
      fetchUserStakes();
      setTransactionId(''); // Reset transaction tracking
    }
  }, [isConfirmed]);
  // Fetch user's token balance and allowance
  const fetchBalanceAndAllowance = async () => {
    // if (!walletAddress) return;
    try {
      // Get token balance
      const balanceResult = await client.readContract({
        address: CONTRACT_ADDRESSES.STAKING_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: ['0xd53d5705924491cdf52e00db9920599090243486' as `0x${string}`],
      });
      setBalance(balanceResult as bigint);
      // Get current Permit2 allowance
      const permit2AllowanceResult = await client.readContract({
        address: CONTRACT_ADDRESSES.STAKING_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddress as `0x${string}`, CONTRACT_ADDRESSES.PERMIT2 as `0x${string}`],
      });
      setPermit2Allowance(permit2AllowanceResult as bigint);
    } catch (err) {
      console.error('Error fetching balance/allowance:', err);
      setError('Failed to fetch wallet data');
    }
  };
  const handleApprove = async () => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }
    
    try {
      setError(null);
      setIsApproving(true);
      
      // Approve maximum amount for Permit2 (one-time approval)
      const maxAmount = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'); // 2^256 - 1
      
      // Send approval transaction using World Mini App
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.STAKING_TOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [CONTRACT_ADDRESSES.PERMIT2, maxAmount.toString()],
          },
        ],
      });
      if (finalPayload.status === 'error') {
        console.error('Error sending approval transaction:', finalPayload);
        setError('Failed to send approval transaction');
      } else {
        console.log('Approval transaction sent:', finalPayload.transaction_id);
        setTransactionId(finalPayload.transaction_id);
      }
      
    } catch (err: any) {
      console.error('Error approving tokens:', err);
      if (err.message?.includes('user_rejected') || err.message?.includes('cancelled')) {
        setError('Transaction was cancelled by user');
      } else {
        setError('Failed to approve tokens. Please try again.');
      }
    } finally {
      setIsApproving(false);
    }
  };
  const handleStakeWithPermit2 = async () => {
    if (!amount || !walletAddress) {
      setError('Wallet not connected or amount not specified');
      return;
    }
    
    try {
      setError(null);
      setIsStaking(true);
      
      const amountToStake = parseEther(amount);
      
      // Validate amount
      if (amountToStake <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      // Check if user has enough balance
      if (amountToStake > balance) {
        throw new Error(`Insufficient balance. You have ${formatBigInt(balance)} WST, but trying to stake ${amount} WST`);
      }
      console.log('Starting Permit2 staking process...');
      console.log('Amount to stake:', amount, 'Wei:', amountToStake.toString());
      // Get nonce for permit2
      const wordPos = 0;
      const bitmap = await client.readContract({
        address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
        abi: WORLD_STAKING_ABI,
        functionName: 'getNonceBitmap',
        args: [walletAddress as `0x${string}`, BigInt(wordPos)],
      });
      let bitmapBigInt = BigInt(bitmap as string);
      let bit = 0;
      while (bit < 256) {
        if ((bitmapBigInt & (BigInt(1) << BigInt(bit))) === BigInt(0)) break;
        bit++;
      }
      if (bit === 256) throw new Error('No available nonce found');
      const nonce = BigInt(wordPos * 256 + bit);
      // Create permit transfer data with 30-minute deadline
      const deadline = Math.floor((Date.now() + 30 * 60 * 1000) / 1000).toString();
      
      const permitTransfer = {
        permitted: {
          token: CONTRACT_ADDRESSES.STAKING_TOKEN,
          amount: amountToStake.toString(),
        },
        nonce: nonce.toString(),
        deadline,
      };
      const transferDetails = {
        to: CONTRACT_ADDRESSES.WORLD_STAKING,
        requestedAmount: amountToStake.toString(),
      };
      console.log('Permit transfer data:', permitTransfer);
      console.log('Transfer details:', transferDetails);
      // Send transaction using World Mini App with Permit2
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.WORLD_STAKING,
            abi: WORLD_STAKING_ABI,
            functionName: 'stakeWithPermit2',
            args: [
              amountToStake.toString(),
              [
                [
                  permitTransfer.permitted.token,
                  permitTransfer.permitted.amount,
                ],
                permitTransfer.nonce,
                permitTransfer.deadline,
              ],
              'PERMIT2_SIGNATURE_PLACEHOLDER_0',
            ],
          },
        ],
        permit2: [
          {
            ...permitTransfer,
            spender: CONTRACT_ADDRESSES.WORLD_STAKING,
          },
        ],
      });
      if (finalPayload.status === 'error') {
        console.error('Error sending staking transaction:', finalPayload);
        setError('Failed to send staking transaction');
      } else {
        console.log('Staking transaction sent:', finalPayload.transaction_id);
        setTransactionId(finalPayload.transaction_id);
        setAmount(''); // Clear form after successful transaction
      }
      
    } catch (err: any) {
      console.error('Error staking tokens:', err);
      if (err.message?.includes('user_rejected') || err.message?.includes('cancelled')) {
        setError('Transaction was cancelled by user');
      } else {
        setError(`Failed to stake tokens: ${err.message}`);
      }
    } finally {
      setIsStaking(false);
    }
  };
  const handleMaxAmount = () => {
    if (balance > BigInt(0)) {
      setAmount(formatBigInt(balance));
    }
  };
  // Helper function to parse ether
  const parseEther = (value: string): bigint => {
    try {
      const num = parseFloat(value);
      if (isNaN(num)) return BigInt(0);
      return BigInt(Math.floor(num * 1e18));
    } catch {
      return BigInt(0);
    }
  };
  // Validation
  const isValidAmount = amount && parseFloat(amount) > 0;
  const hasEnoughBalance = isValidAmount && parseEther(amount) <= balance;
  
  // Check if user needs to approve tokens for Permit2
  const needsApproval = isValidAmount && permit2Allowance === BigInt(0);
  // Format balance for display
  const formattedBalance = formatBigInt(balance);
  // Show transaction confirmation status
  const showTransactionStatus = transactionId && (isConfirming || isConfirmed);

  // Add function to fetch user's stakes
  const fetchUserStakes = async () => {
    if (!walletAddress) return;
    
    try {
      setIsLoadingStakes(true);
      
      // Get total number of stakes for the user
      const stakeCount = await client.readContract({
        address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
        abi: WORLD_STAKING_ABI,
        functionName: 'getStakeCount',
        args: [walletAddress as `0x${string}`],
      });
      
      const totalStakes = Number(stakeCount);
      const userStakes: StakeDetails[] = [];
      
      // Fetch details for each stake
      for (let i = 0; i < totalStakes; i++) {
        const stakeDetails = await client.readContract({
          address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
          abi: WORLD_STAKING_ABI,
          functionName: 'getStakeDetails',
          args: [walletAddress as `0x${string}`, BigInt(i)],
        });
        
        const [amount, timestamp, tradingAmount, currentTradeValue, tradeActive, claimableRewards, active] = stakeDetails as [bigint, bigint, bigint, bigint, boolean, bigint, boolean];
        
        userStakes.push({
          amount,
          timestamp,
          tradingAmount,
          currentTradeValue,
          tradeActive,
          claimableRewards,
          active,
          index: i,
        });
      }
      
      setStakes(userStakes);
    } catch (err) {
      console.error('Error fetching user stakes:', err);
      setError('Failed to fetch stakes');
    } finally {
      setIsLoadingStakes(false);
    }
  };

  // Add function to check if a stake can be unstaked
  const canUnstake = async (stakeIndex: number): Promise<boolean> => {
    if (!walletAddress) return false;
    
    try {
      const result = await client.readContract({
        address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
        abi: WORLD_STAKING_ABI,
        functionName: 'canUnstake',
        args: [walletAddress as `0x${string}`, BigInt(stakeIndex)],
      });
      
      return result as boolean;
    } catch (err) {
      console.error('Error checking unstake eligibility:', err);
      return false;
    }
  };

  // Add function to handle unstaking
  const handleUnstake = async (stakeIndex: number) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }
    
    try {
      setError(null);
      setIsWithdrawing(prev => ({ ...prev, [stakeIndex]: true }));
      
      // Check if stake can be unstaked
      const canUnstakeResult = await canUnstake(stakeIndex);
      if (!canUnstakeResult) {
        throw new Error('Cannot unstake: either lock-in period not over, trade still active, or stake not active');
      }
      
      // Send unstake transaction
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.WORLD_STAKING,
            abi: WORLD_STAKING_ABI,
            functionName: 'unstake',
            args: [BigInt(stakeIndex)],
          },
        ],
      });
      
      if (finalPayload.status === 'error') {
        console.error('Error sending unstake transaction:', finalPayload);
        setError('Failed to send unstake transaction');
      } else {
        console.log('Unstake transaction sent:', finalPayload.transaction_id);
        setTransactionId(finalPayload.transaction_id);
      }
      
    } catch (err: any) {
      console.error('Error unstaking tokens:', err);
      if (err.message?.includes('user_rejected') || err.message?.includes('cancelled')) {
        setError('Transaction was cancelled by user');
      } else {
        setError(`Failed to unstake tokens: ${err.message}`);
      }
    } finally {
      setIsWithdrawing(prev => ({ ...prev, [stakeIndex]: false }));
    }
  };

  // Add effect to fetch stakes when wallet address changes
  useEffect(() => {
    if (walletAddress) {
      fetchUserStakes();
    }
  }, [walletAddress]);

  // Helper function to format timestamp
  const formatTimestamp = (timestamp: bigint): string => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Helper function to calculate time until unlock
  const getTimeUntilUnlock = (timestamp: bigint): string => {
    const lockEndTime = Number(timestamp) + (10 * 60); // 10 minutes lock period
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = lockEndTime - now;
    
    if (timeLeft <= 0) return 'Unlocked';
    
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="w-full bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            🌍 World Staking Platform
          </h1>
          <p className="text-gray-600 text-lg">Stake your tokens and earn rewards with automated trading</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 bg-gray-50">
            <div className="flex">
              <button
                onClick={() => setActiveTab('stake')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 relative ${
                  activeTab === 'stake'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50 border-r border-gray-200'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  💰 Stake Tokens
                </span>
                {activeTab === 'stake' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-400"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('withdraw')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 relative ${
                  activeTab === 'withdraw'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  🏦 Withdraw Stakes
                </span>
                {activeTab === 'withdraw' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-400"></div>
                )}
              </button>
            </div>
          </div>

          <div className="p-6 md:p-8">
            {/* Wallet Connection Status */}
            {walletAddress && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <div>
                    <p className="font-medium text-green-800">Wallet Connected</p>
                    <p className="text-sm text-green-600 font-mono">
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Status */}
            {showTransactionStatus && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-3">
                  {isConfirming && (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                      <div>
                        <p className="font-medium text-blue-800">Transaction Confirming...</p>
                        <p className="text-sm text-blue-600">Please wait while we process your transaction</p>
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
                        <p className="text-sm text-green-600">Your transaction was successful</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-red-500 text-xl">⚠️</span>
                  <div className="flex-1">
                    <p className="font-medium text-red-800">Error</p>
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-600 transition-colors p-1 hover:bg-red-100 rounded-full"
                  >
                    <span className="text-xl">×</span>
                  </button>
                </div>
              </div>
            )}

            {/* Stake Tab Content */}
            {activeTab === 'stake' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Stake Your Tokens</h2>
                  <p className="text-gray-600">Start earning rewards with automated trading</p>
                </div>
                
                {/* Balance Card */}
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                  <h3 className="text-lg font-semibold mb-2">Your Balance</h3>
                  <p className="text-3xl font-bold">{formattedBalance} WST</p>
                  <div className="mt-3 text-sm opacity-90">
                    <p>Permit2 Allowance: {formatBigInt(permit2Allowance)} WST</p>
                    {permit2Allowance === BigInt(0) && (
                      <p className="text-yellow-200 mt-1">
                        ⚠️ One-time approval needed for Permit2
                      </p>
                    )}
                  </div>
                </div>

                {/* Staking Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Amount to Stake
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount (e.g., 10.5)"
                        disabled={isConfirming}
                        className="w-full p-4 pr-16 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all shadow-sm"
                      />
                      <button 
                        onClick={handleMaxAmount}
                        disabled={balance === BigInt(0) || isConfirming}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 px-3 py-1 bg-blue-100 text-blue-600 text-sm font-semibold rounded-lg hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-blue-200 hover:border-blue-300 hover:shadow-sm"
                      >
                        MAX
                      </button>
                    </div>
                    {isValidAmount && !hasEnoughBalance && (
                      <p className="mt-2 text-sm text-red-600">Insufficient balance</p>
                    )}
                  </div>

                  {/* Stake Button */}
                  <button
                    onClick={handleStakeWithPermit2}
                    disabled={!isValidAmount || !hasEnoughBalance || isStaking || !walletAddress || isConfirming}
                    className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 border-2 ${
                      isStaking || !isValidAmount || !hasEnoughBalance || isConfirming
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed border-gray-300'
                        : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 transform hover:scale-[1.02] shadow-lg hover:shadow-xl border-blue-600 hover:border-blue-700'
                    }`}
                  >
                    {isStaking ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        Staking...
                      </span>
                    ) : (
                      '🚀 Stake with Permit2'
                    )}
                  </button>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <h4 className="font-semibold text-blue-800 mb-2">📊 Trading Strategy</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• 2% of staked amount used for trading</li>
                      <li>• Automated profit generation</li>
                      <li>• Real-time value tracking</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <h4 className="font-semibold text-green-800 mb-2">🎁 Rewards</h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>• Claim rewards on Sundays</li>
                      <li>• 10-minute lock period (testing)</li>
                      <li>• Profit-based reward system</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Withdraw Tab Content */}
            {activeTab === 'withdraw' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Your Stakes</h2>
                    <p className="text-gray-600">Manage and withdraw your staked tokens</p>
                  </div>
                  <button
                    onClick={fetchUserStakes}
                    disabled={isLoadingStakes}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 border-2 border-blue-600 hover:border-blue-700 shadow-md hover:shadow-lg"
                  >
                    {isLoadingStakes ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Refreshing...
                      </>
                    ) : (
                      <>
                        🔄 Refresh
                      </>
                    )}
                  </button>
                </div>
                
                {isLoadingStakes ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-gray-600">Loading your stakes...</p>
                  </div>
                ) : stakes.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="text-6xl mb-4">💼</div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No Stakes Found</h3>
                    <p className="text-gray-600 mb-6">Start by staking some tokens to see them here!</p>
                    <button
                      onClick={() => setActiveTab('stake')}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 border-2 border-blue-600 hover:border-blue-700 shadow-md hover:shadow-lg font-semibold"
                    >
                      Start Staking
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stakes.map((stake, index) => (
                      <div key={index} className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-4">
                              <h3 className="text-lg font-semibold text-gray-800">
                                Stake #{stake.index}
                              </h3>
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                stake.active 
                                  ? 'bg-green-100 text-green-800 border-green-300' 
                                  : 'bg-gray-100 text-gray-600 border-gray-300'
                              }`}>
                                {stake.active ? '🟢 Active' : '⚫ Inactive'}
                              </span>
                              {stake.tradeActive && (
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300">
                                  📈 Trading
                                </span>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                <p className="text-xs text-blue-600 font-medium mb-1">Staked Amount</p>
                                <p className="font-mono font-semibold text-blue-800">{formatBigInt(stake.amount)} WST</p>
                              </div>
                              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                                <p className="text-xs text-purple-600 font-medium mb-1">Trading Amount</p>
                                <p className="font-mono font-semibold text-purple-800">{formatBigInt(stake.tradingAmount)} WST</p>
                              </div>
                              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                                <p className="text-xs text-green-600 font-medium mb-1">Current Value</p>
                                <p className="font-mono font-semibold text-green-800">{formatBigInt(stake.currentTradeValue)} WST</p>
                              </div>
                              <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                                <p className="text-xs text-yellow-600 font-medium mb-1">Rewards</p>
                                <p className="font-mono font-semibold text-yellow-800">{formatBigInt(stake.claimableRewards)} RWD</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <p className="text-xs text-gray-600 font-medium mb-1">Staked On</p>
                                <p className="text-xs text-gray-800">{formatTimestamp(stake.timestamp)}</p>
                              </div>
                              <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                                <p className="text-xs text-indigo-600 font-medium mb-1">Lock Status</p>
                                <p className={`text-xs font-semibold ${
                                  getTimeUntilUnlock(stake.timestamp) === 'Unlocked' 
                                    ? 'text-green-600' 
                                    : 'text-orange-600'
                                }`}>
                                  {getTimeUntilUnlock(stake.timestamp)}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-3">
                            {stake.active && (
                              <button
                                onClick={() => handleUnstake(stake.index)}
                                disabled={
                                  isWithdrawing[stake.index] || 
                                  stake.tradeActive || 
                                  isConfirming ||
                                  getTimeUntilUnlock(stake.timestamp) !== 'Unlocked'
                                }
                                className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 border-2 ${
                                  isWithdrawing[stake.index] || 
                                  stake.tradeActive || 
                                  isConfirming ||
                                  getTimeUntilUnlock(stake.timestamp) !== 'Unlocked'
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed border-gray-300'
                                    : 'bg-red-600 text-white hover:bg-red-700 transform hover:scale-105 shadow-lg hover:shadow-xl border-red-600 hover:border-red-700'
                                }`}
                              >
                                {isWithdrawing[stake.index] ? (
                                  <span className="flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                    Withdrawing...
                                  </span>
                                ) : (
                                  '🏦 Withdraw'
                                )}
                              </button>
                            )}
                            
                            {stake.tradeActive && (
                              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                                ⚠️ Trade must be exited first
                              </p>
                            )}
                            
                            {!stake.active && (
                              <p className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                                ✅ Already withdrawn
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Info Section */}
                <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 shadow-sm">
                  <h4 className="font-semibold text-gray-800 mb-3">📋 Withdrawal Guidelines</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Stakes unlock after 10 minutes (testing period)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-500">ℹ️</span>
                      <span>Active trades must be exited by backend first</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-purple-500">🎁</span>
                      <span>Rewards can be claimed separately on Sundays</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-orange-500">💰</span>
                      <span>Withdrawn stakes return original tokens</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}