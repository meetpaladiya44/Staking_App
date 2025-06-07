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
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      {/* Add tab navigation */}
      <div className="flex mb-6">
        <button
          onClick={() => setActiveTab('stake')}
          className={`px-4 py-2 rounded-l-lg font-medium transition-colors ${
            activeTab === 'stake'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Stake Tokens
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`px-4 py-2 rounded-r-lg font-medium transition-colors ${
            activeTab === 'withdraw'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Withdraw Stakes
        </button>
      </div>

      {walletAddress && (
        <div className="mb-4 p-2 bg-gray-700 rounded text-sm">
          <p className="text-gray-300">
            Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
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

      {/* Stake Tab Content */}
      {activeTab === 'stake' && (
        <>
          <h2 className="text-xl font-bold mb-4">Stake Tokens</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Amount to Stake</label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                disabled={isConfirming}
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <button 
                  onClick={handleMaxAmount}
                  className="text-blue-400 text-xs hover:text-blue-300 disabled:opacity-50"
                  disabled={balance === BigInt(0) || isConfirming}
                >
                  MAX
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-400">Balance: {formattedBalance} WST</p>
            <p className="mt-1 text-xs text-gray-500">
              Permit2 Allowance: {formatBigInt(permit2Allowance)} WST
              {permit2Allowance === BigInt(0) && (
                <span className="text-amber-400 ml-2">
                  ⚠️ Needs one-time approval for Permit2
                </span>
              )}
            </p>
            
            {isValidAmount && !hasEnoughBalance && (
              <p className="mt-1 text-sm text-red-400">Insufficient balance</p>
            )}
          </div>
          
          {error && (
            <div className="mb-4 p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-200">
              {error}
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <button
              onClick={handleStakeWithPermit2}
              disabled={!isValidAmount || !hasEnoughBalance || isStaking || !walletAddress || isConfirming}
              className={`w-full p-2 rounded font-medium transition-colors ${
                isStaking || !isValidAmount || !hasEnoughBalance || isConfirming
                  ? 'bg-blue-800 cursor-not-allowed opacity-50'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isStaking ? 'Staking...' : 'Stake with Permit2'}
            </button>
          </div>
          
          <div className="mt-4 text-sm text-gray-400">
            <p>• World App will show a confirmation popup for each transaction</p>
            <p>• Uses Permit2 for gasless token transfers (one-time approval needed)</p>
            <p>• Transactions are processed on World Chain (gas fees covered)</p>
            <p>• Staking locks your tokens for 10 minutes (for testing)</p>
            <p>• 2% of staked amount will be used for trading</p>
            <p>• Rewards can be claimed anytime after lock period</p>
          </div>
        </>
      )}

      {/* Withdraw Tab Content */}
      {activeTab === 'withdraw' && (
        <>
          <h2 className="text-xl font-bold mb-4">Your Stakes</h2>
          
          {error && (
            <div className="mb-4 p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-200">
              {error}
            </div>
          )}
          
          <div className="mb-4">
            <button
              onClick={fetchUserStakes}
              disabled={isLoadingStakes}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50"
            >
              {isLoadingStakes ? 'Refreshing...' : 'Refresh Stakes'}
            </button>
          </div>
          
          {isLoadingStakes ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
              <span className="ml-2 text-gray-400">Loading stakes...</span>
            </div>
          ) : stakes.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No stakes found</p>
              <p className="text-sm">Start by staking some tokens!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stakes.map((stake, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-medium">Stake #{stake.index}</h3>
                        <span className={`px-2 py-1 rounded text-xs ${
                          stake.active ? 'bg-green-900 text-green-200' : 'bg-gray-600 text-gray-300'
                        }`}>
                          {stake.active ? 'Active' : 'Inactive'}
                        </span>
                        {stake.tradeActive && (
                          <span className="px-2 py-1 rounded text-xs bg-yellow-900 text-yellow-200">
                            Trade Active
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-400">Staked Amount</p>
                          <p className="font-mono">{formatBigInt(stake.amount)} WST</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Trading Amount</p>
                          <p className="font-mono">{formatBigInt(stake.tradingAmount)} WST</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Current Trade Value</p>
                          <p className="font-mono">{formatBigInt(stake.currentTradeValue)} WST</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Claimable Rewards</p>
                          <p className="font-mono">{formatBigInt(stake.claimableRewards)} RWD</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Staked On</p>
                          <p className="text-xs">{formatTimestamp(stake.timestamp)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Lock Status</p>
                          <p className="text-xs">{getTimeUntilUnlock(stake.timestamp)}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="ml-4">
                      {stake.active && (
                        <button
                          onClick={() => handleUnstake(stake.index)}
                          disabled={
                            isWithdrawing[stake.index] || 
                            stake.tradeActive || 
                            isConfirming ||
                            getTimeUntilUnlock(stake.timestamp) !== 'Unlocked'
                          }
                          className={`px-4 py-2 rounded font-medium transition-colors ${
                            isWithdrawing[stake.index] || 
                            stake.tradeActive || 
                            isConfirming ||
                            getTimeUntilUnlock(stake.timestamp) !== 'Unlocked'
                              ? 'bg-red-800 cursor-not-allowed opacity-50'
                              : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {isWithdrawing[stake.index] ? 'Withdrawing...' : 'Withdraw'}
                        </button>
                      )}
                      
                      {stake.tradeActive && (
                        <p className="text-xs text-amber-400 mt-2">
                          ⚠️ Trade must be exited first
                        </p>
                      )}
                      
                      {!stake.active && (
                        <p className="text-xs text-gray-400 mt-2">
                          Already withdrawn
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-400">
            <p>• Stakes must be unlocked (10 minutes after staking)</p>
            <p>• Active trades must be exited by the backend before withdrawal</p>
            <p>• Rewards can be claimed separately on Sundays</p>
            <p>• Withdrawn stakes will transfer your original tokens back</p>
          </div>
        </>
      )}
    </div>
  );
}