import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CONTRACT_ADDRESSES, WORLD_STAKING_ABI } from '../components/constants/contracts';

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


// Simulation parameters
const TRADE_UPDATE_INTERVAL = 30 * 1000; // 30 seconds
const TRADE_EXIT_TIME = 5 * 60 * 1000; // 5 minutes
const PRICE_VOLATILITY = 5; // Percentage range for price movements

/**
 * Simulates price movements for active trades
 * @param currentValue The current trade value
 * @returns The new trade value after a simulated price movement
 */
export function simulatePriceMovement(currentValue: bigint): bigint {
  // Generate a random percentage change between -PRICE_VOLATILITY and +PRICE_VOLATILITY
  const percentageChange = (Math.random() * (PRICE_VOLATILITY * 2) - PRICE_VOLATILITY) / 100;
  
  // Calculate the change amount
  const changeAmount = (BigInt(Math.floor(Number(currentValue) * Math.abs(percentageChange))));
  
  // Apply the change (positive or negative)
  if (percentageChange >= 0) {
    return currentValue + changeAmount;
  } else {
    // Ensure we don't go below 50% of the original value
    return currentValue - (changeAmount > currentValue / BigInt(2) ? currentValue / BigInt(2) : changeAmount);
  }
}

/**
 * Runs the trade simulation for all active stakes
 * @param privateKey The private key of the contract owner
 */
export async function runTradeSimulation(privateKey: string) {
  if (!privateKey) {
    console.error('Private key is required to run trade simulation');
    return;
  }

  try {
    // Create account from private key
    const account = privateKeyToAccount(`0x${privateKey}`);
    
    // Create clients
    const publicClient = createPublicClient({
      chain: worldChainMainnet,
      transport: http()
    });
    
    const walletClient = createWalletClient({
      account,
      chain: worldChainMainnet,
      transport: http()
    });

    console.log('Starting trade simulation...');
    
    // Keep track of trades and when they started
    const tradeStartTimes = new Map<string, number>(); // key: user-stakeIndex, value: start time
    
    // Run simulation loop
    const simulationInterval = setInterval(async () => {
      try {
        // Get all users with active stakes from events (simplified approach)
        const stakedEvents = await publicClient.getLogs({
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
          const stakeCount = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
            abi: WORLD_STAKING_ABI,
            functionName: 'getStakeCount',
            args: [user]
          }) as bigint;
          
          // Check each stake
          for (let i = 0; i < Number(stakeCount); i++) {
            try {
              // Get stake details
              const stakeDetails = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
                abi: WORLD_STAKING_ABI,
                functionName: 'getStakeDetails',
                args: [user, BigInt(i)]
              }) as any[];
              
              const active = stakeDetails[6] as boolean;
              const tradeActive = stakeDetails[4] as boolean;
              
              if (active && tradeActive) {
                const tradeKey = `${user}-${i}`;
                const currentValue = stakeDetails[3] as bigint;
                
                // Record start time if this is a new trade
                if (!tradeStartTimes.has(tradeKey)) {
                  tradeStartTimes.set(tradeKey, Date.now());
                  console.log(`New trade detected for user ${user} stake #${i}`);
                }
                
                const tradeStartTime = tradeStartTimes.get(tradeKey)!;
                const tradeElapsedTime = Date.now() - tradeStartTime;
                
                // Check if it's time to exit the trade
                if (tradeElapsedTime >= TRADE_EXIT_TIME) {
                  // Exit the trade
                  console.log(`Exiting trade for user ${user} stake #${i}`);
                  
                  // Simulate a final price movement (with higher chance of profit)
                  const profitChance = Math.random();
                  let finalValue = currentValue;
                  
                  if (profitChance > 0.3) {
                    // 70% chance of profit
                    const profitPercentage = 5 + Math.random() * 15; // 5-20% profit
                    const tradingAmount = stakeDetails[2] as bigint;
                    finalValue = tradingAmount + BigInt(Math.floor(Number(tradingAmount) * profitPercentage / 100));
                  } else {
                    // 30% chance of loss
                    const lossPercentage = Math.random() * 10; // 0-10% loss
                    const tradingAmount = stakeDetails[2] as bigint;
                    finalValue = tradingAmount - BigInt(Math.floor(Number(tradingAmount) * lossPercentage / 100));
                  }
                  
                  // Call exitTrade function
                  await walletClient.writeContract({
                    address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
                    abi: WORLD_STAKING_ABI,
                    functionName: 'exitTrade',
                    args: [user, BigInt(i), finalValue]
                  });
                  
                  console.log(`Trade exited for user ${user} stake #${i} with final value: ${finalValue}`);
                  tradeStartTimes.delete(tradeKey);
                } else {
                  // Update the trade value
                  const newValue = simulatePriceMovement(currentValue);
                  
                  await walletClient.writeContract({
                    address: CONTRACT_ADDRESSES.WORLD_STAKING as `0x${string}`,
                    abi: WORLD_STAKING_ABI,
                    functionName: 'updateTradeValue',
                    args: [user, BigInt(i), newValue]
                  });
                  
                  console.log(`Updated trade value for user ${user} stake #${i}: ${currentValue} -> ${newValue}`);
                }
              }
            } catch (err) {
              console.error(`Error processing stake ${i} for user ${user}:`, err);
            }
          }
        }
      } catch (err) {
        console.error('Error in trade simulation:', err);
      }
    }, TRADE_UPDATE_INTERVAL);
    
    return () => {
      clearInterval(simulationInterval);
      console.log('Trade simulation stopped');
    };
    
  } catch (err) {
    console.error('Failed to start trade simulation:', err);
  }
} 