'use client';

import { useState, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useWaitForTransactionReceipt } from '@worldcoin/minikit-react';
import { createPublicClient, http } from 'viem';
import { worldchain } from 'viem/chains';
import { CONTRACT_ADDRESSES, ERC20_ABI, WORLD_STAKING_ABI } from '../constants/contracts';
import { formatBigInt } from '../../utils/format';
import { useSession } from 'next-auth/react'

// World Chain Sepolia configuration
const worldChainSepolia = {
  id: 4801,
  name: 'World Chain Sepolia',
  network: 'worldchain-sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    public: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] },
    default: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] },
  },
  blockExplorers: {
    default: { name: 'World Chain Sepolia Explorer', url: 'https://sepolia.worldscan.org/' },
  },
  testnet: true,
};

export function StakingForm2() {
  const { data: session } = useSession()
  const [amount, setAmount] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');

  // Setup viem client for World Chain
  const client = createPublicClient({
    chain: worldChainSepolia,
    transport: http('https://worldchain-sepolia.g.alchemy.com/public'),
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

      // Get current allowance
      const allowanceResult = await client.readContract({
        address: CONTRACT_ADDRESSES.STAKING_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddress as `0x${string}`, CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`],
      });
      setAllowance(allowanceResult as bigint);

    } catch (err) {
      console.error('Error fetching balance/allowance:', err);
      setError('Failed to fetch wallet data');
    }
  };

  const handleApprove = async () => {
    if (!amount || !walletAddress) {
      setError('Wallet not connected or amount not specified');
      return;
    }
    
    try {
      setError(null);
      setIsApproving(true);
      
      const amountToApprove = parseEther(amount);
      
      // Send approval transaction using World Mini App
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.STAKING_TOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [CONTRACT_ADDRESSES.WORLD_STAKING, amountToApprove.toString()],
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

  const handleStake = async () => {
    if (!amount || !walletAddress) {
      setError('Wallet not connected or amount not specified');
      return;
    }
    
    try {
      setError(null);
      setIsStaking(true);
      
      const amountToStake = parseEther(amount);
      
      // Send staking transaction using World Mini App
      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: CONTRACT_ADDRESSES.WORLD_STAKING,
            abi: WORLD_STAKING_ABI,
            functionName: 'stake',
            args: [amountToStake.toString()],
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
        setError('Failed to stake tokens. Please try again.');
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
  
  // Check if user needs to approve tokens before staking
  const needsApproval = isValidAmount && parseEther(amount) > allowance;

  // Format balance for display
  const formattedBalance = formatBigInt(balance);

  // Show transaction confirmation status
  const showTransactionStatus = transactionId && (isConfirming || isConfirmed);

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-xl font-bold mb-4">Stake Tokens</h2>
      
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
        {needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={!isValidAmount || !hasEnoughBalance || isApproving || !walletAddress || isConfirming}
            className={`w-full p-2 rounded font-medium transition-colors ${
              isApproving || !isValidAmount || !hasEnoughBalance || isConfirming
                ? 'bg-blue-800 cursor-not-allowed opacity-50'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isApproving ? 'Approving...' : 'Approve Tokens'}
          </button>
        ) : (
          <button
            onClick={handleStake}
            disabled={!isValidAmount || !hasEnoughBalance || isStaking || !walletAddress || isConfirming}
            className={`w-full p-2 rounded font-medium transition-colors ${
              isStaking || !isValidAmount || !hasEnoughBalance || isConfirming
                ? 'bg-blue-800 cursor-not-allowed opacity-50'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isStaking ? 'Staking...' : 'Stake Tokens'}
          </button>
        )}
      </div>
      
      <div className="mt-4 text-sm text-gray-400">
        <p>• World App will show a confirmation popup for each transaction</p>
        <p>• Transactions are processed on World Chain (gas fees covered)</p>
        <p>• Staking locks your tokens for 10 minutes (for testing)</p>
        <p>• 2% of staked amount will be used for trading</p>
        <p>• Rewards can be claimed anytime after lock period</p>
      </div>
    </div>
  );
}