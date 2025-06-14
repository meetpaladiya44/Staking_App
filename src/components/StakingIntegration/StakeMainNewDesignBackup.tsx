'use client';
import React, { useState, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useWaitForTransactionReceipt } from '@worldcoin/minikit-react';
import { createPublicClient, http } from 'viem';
import { worldchain } from 'viem/chains';
import { CONTRACT_ADDRESSES, ERC20_ABI, WORLD_STAKING_ABI } from '../constants/contracts';
import { formatBigInt } from '../../utils/format';
import { useSession } from 'next-auth/react';
import { 
  Button, 
  LiveFeedback, 
  CircularIcon
} from '@worldcoin/mini-apps-ui-kit-react';
import { 
  Wallet, 
  Coins, 
  Gift, 
  Refresh, 
  Eye,
  Calendar,
  Clock,
  Dollar,
  Flash,
  Star,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
} from 'iconoir-react';
import { TrendingUp, BarChart } from 'lucide-react';

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
  const { data: session } = useSession();
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
  const [isClaimingRewards, setIsClaimingRewards] = useState<{ [key: number]: boolean }>({});
  const [isLoadingStakes, setIsLoadingStakes] = useState(false);
  const [activeTab, setActiveTab] = useState<'stake' | 'withdraw'>('stake');
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

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
    const setWalletAndFetchData = async () => {
      if (session?.user?.id) {
        try {
          console.log("session", session);
          console.log("session?.user?.id", session?.user?.id);
          
          // Use session.user.id directly as wallet address
          const walletAddr = session.user.id;
          
          setWalletAddress(walletAddr);
          
          // Fetch balance and allowance with the wallet address
          await fetchBalanceAndAllowanceWithAddress(walletAddr);
          
          // Also fetch user stakes
          await fetchUserStakesWithAddress(walletAddr);
        } catch (error) {
          console.error('Error setting wallet address:', error);
          setError('Failed to set wallet address');
        }
      }
    };
    setWalletAndFetchData();
  }, [session?.user?.id]); // Dependency on session user id

  // Refresh data when transaction is confirmed
  useEffect(() => {
    if (isConfirmed) {
      fetchBalanceAndAllowance();
      fetchUserStakes();
      setTransactionId(''); // Reset transaction tracking
    }
  }, [isConfirmed]);

  // Fetch user's token balance and allowance with specific wallet address
  const fetchBalanceAndAllowanceWithAddress = async (walletAddr: string) => {
    if (!walletAddr) return;
    try {
      // Get token balance
      const balanceResult = await client.readContract({
        address: CONTRACT_ADDRESSES.STAKING_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddr as `0x${string}`],
      });
      setBalance(balanceResult as bigint);
      
      // Get current Permit2 allowance
      const permit2AllowanceResult = await client.readContract({
        address: CONTRACT_ADDRESSES.STAKING_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddr as `0x${string}`, CONTRACT_ADDRESSES.PERMIT2 as `0x${string}`],
      });
      setPermit2Allowance(permit2AllowanceResult as bigint);
    } catch (err) {
      console.error('Error fetching balance/allowance:', err);
      setError('Failed to fetch wallet data');
    }
  };

  // Fetch user's token balance and allowance (using state wallet address)
  const fetchBalanceAndAllowance = async () => {
    await fetchBalanceAndAllowanceWithAddress(walletAddress);
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
        throw new Error(`Insufficient balance. You have ${formatBigInt(balance)} WLD, but trying to stake ${amount} WLD`);
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

        // Store staking information in database
        try {
          const response = await fetch('/api/stake', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              stakeAmount: amount,
              walletAddress: walletAddress,
              username: session?.user?.username || session?.user?.id, // Use username or id as fallback
              transactionId: finalPayload.transaction_id,
            }),
          });

          const result = await response.json();
          if (response.ok) {
            console.log('Staking record created successfully:', result);
          } else {
            console.error('Failed to create staking record:', result.error);
          }
        } catch (dbError) {
          console.error('Error storing staking record:', dbError);
          // Don't show error to user as the transaction was successful
        }

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

  // Add function to fetch user's stakes with specific wallet address
  const fetchUserStakesWithAddress = async (walletAddr: string) => {
    if (!walletAddr) return;

    try {
      setIsLoadingStakes(true);

      // Get total number of stakes for the user
      const stakeCount = await client.readContract({
        address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
        abi: WORLD_STAKING_ABI,
        functionName: 'getStakeCount',
        args: [walletAddr as `0x${string}`],
      });

      const totalStakes = Number(stakeCount);
      const userStakes: StakeDetails[] = [];

      // Fetch details for each stake
      for (let i = 0; i < totalStakes; i++) {
        const stakeDetails = await client.readContract({
          address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
          abi: WORLD_STAKING_ABI,
          functionName: 'getStakeDetails',
          args: [walletAddr as `0x${string}`, BigInt(i)],
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

  // Add function to fetch user's stakes (using state wallet address)
  const fetchUserStakes = async () => {
    await fetchUserStakesWithAddress(walletAddress);
  };

  // Helper function to fetch database stakes (for logging/tracking purposes)
  const fetchDatabaseStakes = async () => {
    if (!walletAddress) return;
    
    try {
      const response = await fetch(`/api/stake?walletAddress=${walletAddress}`);
      const result = await response.json();
      
      if (response.ok) {
        console.log('Database stakes:', result);
        return result.stakes;
      } else {
        console.error('Failed to fetch database stakes:', result.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching database stakes:', error);
      return [];
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

  // Add function to handle claiming rewards
  const handleClaimRewards = async (stakeIndex: number) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }

    try {
      setError(null);
      setIsClaimingRewards(prev => ({ ...prev, [stakeIndex]: true }));

      // Send claim rewards transaction
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.WORLD_STAKING,
            abi: WORLD_STAKING_ABI,
            functionName: 'claimRewards',
            args: [BigInt(stakeIndex)],
          },
        ],
      });

      if (finalPayload.status === 'error') {
        console.error('Error sending claim rewards transaction:', finalPayload);
        setError('Failed to send claim rewards transaction');
      } else {
        console.log('Claim rewards transaction sent:', finalPayload.transaction_id);
        setTransactionId(finalPayload.transaction_id);
      }

    } catch (err: any) {
      console.error('Error claiming rewards:', err);
      if (err.message?.includes('user_rejected') || err.message?.includes('cancelled')) {
        setError('Transaction was cancelled by user');
      } else {
        setError(`Failed to claim rewards: ${err.message}`);
      }
    } finally {
      setIsClaimingRewards(prev => ({ ...prev, [stakeIndex]: false }));
    }
  };

  // Add effect to fetch stakes when wallet address changes
  useEffect(() => {
    if (walletAddress) {
      fetchUserStakesWithAddress(walletAddress);
    }
  }, [walletAddress]);

  // Add effect for live countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Helper function to format timestamp
  const formatTimestamp = (timestamp: bigint): string => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Helper function to calculate time until unlock (7 days lock period)
  const getTimeUntilUnlock = (timestamp: bigint): string => {
    const lockEndTime = Number(timestamp) + (7 * 24 * 60 * 60); // 7 days lock period
    const timeLeft = lockEndTime - currentTime;

    if (timeLeft <= 0) return 'Unlocked';

    const days = Math.floor(timeLeft / (24 * 60 * 60));
    const hours = Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((timeLeft % (60 * 60)) / 60);
    const seconds = timeLeft % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Helper function to get lock end date
  const getLockEndDate = (timestamp: bigint): string => {
    const lockEndTime = Number(timestamp) + (7 * 24 * 60 * 60); // 7 days lock period
    const date = new Date(lockEndTime * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Hero Section */}
        <div className="text-center py-8">
          <div className="flex items-center justify-center mb-4">
            <CircularIcon size="lg" className="bg-gradient-to-r from-blue-500 to-purple-600 border-4 border-white/20 shadow-2xl">
              <Star className="h-8 w-8 text-white" />
            </CircularIcon>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            World Staking Platform
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            Stake your WLD tokens and earn rewards through automated trading strategies
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex bg-white/5">
            <button
              onClick={() => setActiveTab('stake')}
              className={`flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 flex items-center justify-center gap-3 ${
                activeTab === 'stake'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-2xl'
                  : 'text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <TrendingUp className="h-5 w-5" />
              Stake Tokens
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={`flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 flex items-center justify-center gap-3 ${
                activeTab === 'withdraw'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-2xl'
                  : 'text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <Wallet className="h-5 w-5" />
              Withdraw Stakes
            </button>
          </div>
        </div>

        {/* Transaction Status */}
        {showTransactionStatus && (
          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 backdrop-blur-xl border border-blue-500/30 rounded-2xl">
            <div className="p-6">
              <LiveFeedback
                state={isConfirming ? 'pending' : isConfirmed ? 'success' : undefined}
                label={{
                  pending: 'Transaction processing...',
                  success: 'Transaction confirmed!',
                  failed: 'Transaction failed'
                }}
              >
                <div className="flex items-center gap-4">
                  <CircularIcon size="md" className="bg-blue-500">
                    {isConfirming ? <Clock className="h-5 w-5 text-white animate-spin" /> : <ShieldCheck className="h-5 w-5 text-white" />}
                  </CircularIcon>
                  <div>
                    <p className="font-semibold text-white">
                      {isConfirming ? 'Processing Transaction' : 'Transaction Successful'}
                    </p>
                    <p className="text-sm text-slate-300">
                      {isConfirming ? 'Please wait while we confirm your transaction' : 'Your transaction has been completed successfully'}
                    </p>
                  </div>
                </div>
              </LiveFeedback>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 backdrop-blur-xl border border-red-500/30 rounded-2xl">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <CircularIcon size="md" className="bg-red-500 flex-shrink-0">
                  <Flash className="h-5 w-5 text-white" />
                </CircularIcon>
                <div className="flex-1">
                  <p className="font-semibold text-red-400 mb-1">Error Occurred</p>
                  <p className="text-sm text-red-300">{error}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setError(null)}
                  className="bg-red-500/20 hover:bg-red-500/30 border-red-500/50"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {activeTab === 'stake' && (
          <div className="space-y-6">
            {/* Balance Card */}
            <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-xl border border-blue-500/30 rounded-2xl">
              <div className="p-8">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-4">
                    <CircularIcon size="lg" className="bg-gradient-to-r from-blue-500 to-purple-600">
                      <Coins className="h-8 w-8 text-white" />
                    </CircularIcon>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Your Balance</h3>
                  <p className="text-4xl font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text mb-4">
                    {formattedBalance} WLD
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-300 border border-blue-500/50">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Permit2 Ready
                      </span>
                    </div>
                    <p className="text-sm text-slate-200">
                      Allowance: {formatBigInt(permit2Allowance)} WLD
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Staking Form */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
              <div className="p-8">
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Stake Your Tokens</h2>
                    <p className="text-slate-200">Enter the amount you want to stake and earn rewards</p>
                  </div>

                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        type="text"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount (e.g., 10.5)"
                        disabled={isConfirming}
                        className="w-full text-lg py-4 px-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:border-blue-500 focus:bg-white/15 focus:outline-none transition-all"
                      />
                      <Button
                        onClick={handleMaxAmount}
                        disabled={balance === BigInt(0) || isConfirming}
                        size="sm"
                        variant="secondary"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/50 text-blue-300"
                      >
                        MAX
                      </Button>
                    </div>
                    
                    {isValidAmount && !hasEnoughBalance && (
                      <p className="text-sm text-red-400 flex items-center gap-2">
                        <Flash className="h-4 w-4" />
                        Insufficient balance
                      </p>
                    )}
                  </div>

                  <LiveFeedback
                    state={isStaking ? 'pending' : undefined}
                    label={{
                      pending: 'Processing stake...',
                      success: 'Staking successful!',
                      failed: 'Staking failed'
                    }}
                  >
                    <Button
                      onClick={handleStakeWithPermit2}
                      disabled={!isValidAmount || !hasEnoughBalance || isStaking || !walletAddress || isConfirming}
                      size="lg"
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 text-lg shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 transform hover:scale-[1.02]"
                    >
                      {isStaking ? (
                        <div className="flex items-center gap-3">
                          <Clock className="h-5 w-5 animate-spin" />
                          Staking...
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <ArrowUp className="h-5 w-5" />
                          Stake with Permit2
                        </div>
                      )}
                    </Button>
                  </LiveFeedback>
                </div>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 backdrop-blur-xl border border-green-500/30 rounded-2xl">
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <CircularIcon size="md" className="bg-green-500">
                      <BarChart className="h-5 w-5 text-white" />
                    </CircularIcon>
                    <h4 className="font-semibold text-green-400 text-lg">Trading Strategy</h4>
                  </div>
                  <ul className="space-y-3 text-slate-300">
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      2% of staked amount used for trading
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      Automated profit generation
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      Real-time value tracking
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 backdrop-blur-xl border border-purple-500/30 rounded-2xl">
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <CircularIcon size="md" className="bg-purple-500">
                      <Gift className="h-5 w-5 text-white" />
                    </CircularIcon>
                    <h4 className="font-semibold text-purple-400 text-lg">Rewards System</h4>
                  </div>
                  <ul className="space-y-3 text-slate-300">
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      Claim rewards on Sundays
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      7-day lock period
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      Profit-based reward system
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Withdraw Tab Content */}
        {activeTab === 'withdraw' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Your Stakes</h2>
                    <p className="text-slate-200">Manage and withdraw your staked positions</p>
                  </div>
                  <LiveFeedback
                    state={isLoadingStakes ? 'pending' : undefined}
                    label={{
                      pending: 'Refreshing stakes...',
                      success: 'Stakes updated',
                      failed: 'Failed to refresh'
                    }}
                  >
                    <Button
                      onClick={fetchUserStakes}
                      disabled={isLoadingStakes}
                      variant="secondary"
                      className="bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/50 text-blue-300"
                    >
                      <Refresh className={`h-4 w-4 mr-2 ${isLoadingStakes ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </LiveFeedback>
                </div>
              </div>
            </div>

            {stakes.length === 0 ? (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                <div className="p-12 text-center">
                  <CircularIcon size="lg" className="bg-slate-500/20 mx-auto mb-4">
                    <Eye className="h-8 w-8 text-slate-200" />
                  </CircularIcon>
                  <p className="text-slate-200 text-lg">No stakes found</p>
                  <p className="text-slate-300 text-sm mt-2">Start staking to see your positions here</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {stakes.map((stake, index) => (
                  <div key={index} className="bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all duration-300 rounded-2xl">
                    <div className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-6">
                            <CircularIcon size="md" className="bg-blue-500">
                              <Dollar className="h-5 w-5 text-white" />
                            </CircularIcon>
                            <div>
                              <h3 className="text-xl font-semibold text-white">Stake #{stake.index}</h3>
                              <div className="flex items-center gap-3 mt-1">
                                <span 
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${stake.active 
                                    ? "bg-green-500/20 text-green-300 border border-green-500/50" 
                                    : "bg-slate-500/20 text-slate-200 border border-slate-500/50"
                                  }`}
                                >
                                  {stake.active ? '🟢 Active' : '⚫ Inactive'}
                                </span>
                                {stake.tradeActive && (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/50">
                                    📈 Trading
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                              <p className="text-xs text-blue-400 font-medium mb-2 flex items-center gap-1">
                                <Coins className="h-3 w-3" />
                                Staked Amount
                              </p>
                              <p className="font-bold text-white text-lg">{formatBigInt(stake.amount)} WLD</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                              <p className="text-xs text-purple-400 font-medium mb-2 flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Trading
                              </p>
                              <p className="font-bold text-white text-lg">{formatBigInt(stake.tradingAmount)} WLD</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                              <p className="text-xs text-green-400 font-medium mb-2 flex items-center gap-1">
                                <BarChart className="h-3 w-3" />
                                Current Value
                              </p>
                              <p className="font-bold text-white text-lg">{formatBigInt(stake.currentTradeValue)} WLD</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                              <p className="text-xs text-yellow-400 font-medium mb-2 flex items-center gap-1">
                                <Gift className="h-3 w-3" />
                                Rewards
                              </p>
                              <p className="font-bold text-white text-lg">{formatBigInt(stake.claimableRewards)} RWD</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                              <p className="text-xs text-slate-200 font-medium mb-2 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Staked On
                              </p>
                              <p className="text-sm text-slate-300 font-mono">{formatTimestamp(stake.timestamp)}</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                              <p className="text-xs text-orange-400 font-medium mb-2 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Lock-In Period
                              </p>
                              <p className="text-sm text-orange-300 font-mono">
                                {getTimeUntilUnlock(stake.timestamp) === 'Unlocked' ? (
                                  <span className="text-green-400">✅ Unlocked</span>
                                ) : (
                                  <span className="text-orange-300">{getTimeUntilUnlock(stake.timestamp)}</span>
                                )}
                              </p>
                              <p className="text-xs text-slate-300 mt-1">
                                Until: {getLockEndDate(stake.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                          {stake.active && (
                            <div className="flex flex-col gap-3">
                              {/* Claim Rewards Button */}
                              <LiveFeedback
                                state={isClaimingRewards[stake.index] ? 'pending' : undefined}
                                label={{
                                  pending: 'Processing claim...',
                                  success: 'Claim successful!',
                                  failed: 'Claim failed'
                                }}
                              >
                                <Button
                                  onClick={() => handleClaimRewards(stake.index)}
                                  disabled={
                                    isClaimingRewards[stake.index] ||
                                    isConfirming ||
                                    getTimeUntilUnlock(stake.timestamp) !== 'Unlocked' ||
                                    stake.claimableRewards === BigInt(0)
                                  }
                                  variant="secondary"
                                  className={`${
                                    getTimeUntilUnlock(stake.timestamp) !== 'Unlocked' || stake.claimableRewards === BigInt(0)
                                      ? 'bg-slate-500/20 text-slate-200 border-slate-500/50 cursor-not-allowed'
                                      : 'bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-500/50 text-yellow-300 hover:text-yellow-200'
                                  }`}
                                >
                                  {isClaimingRewards[stake.index] ? (
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 animate-spin" />
                                      Claiming...
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Gift className="h-4 w-4" />
                                      Claim Rewards
                                    </div>
                                  )}
                                </Button>
                              </LiveFeedback>
                              
                              {/* Withdraw Button */}
                              <LiveFeedback
                                state={isWithdrawing[stake.index] ? 'pending' : undefined}
                                label={{
                                  pending: 'Processing withdrawal...',
                                  success: 'Withdrawal successful!',
                                  failed: 'Withdrawal failed'
                                }}
                              >
                                <Button
                                  onClick={() => handleUnstake(stake.index)}
                                  disabled={
                                    isWithdrawing[stake.index] ||
                                    stake.tradeActive ||
                                    isConfirming ||
                                    getTimeUntilUnlock(stake.timestamp) !== 'Unlocked'
                                  }
                                  variant="secondary"
                                  className="bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-red-300 hover:text-red-200"
                                >
                                  {isWithdrawing[stake.index] ? (
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 animate-spin" />
                                      Withdrawing...
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <ArrowDown className="h-4 w-4" />
                                      Withdraw
                                    </div>
                                  )}
                                </Button>
                              </LiveFeedback>
                            </div>
                          )}

                          {stake.tradeActive && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/50">
                              ⚠️ Trade must be exited first
                            </span>
                          )}

                          {!stake.active && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-200 border border-slate-500/50">
                              ✅ Already withdrawn
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}