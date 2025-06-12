import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../utils/dbConnect';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { stakeAmount, walletAddress, username, transactionId } = body;

    // Validate required fields
    if (!stakeAmount || !walletAddress || !username) {
      return NextResponse.json(
        { error: 'Missing required fields: stakeAmount, walletAddress, username' },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const client = await dbConnect();
    const db = client.db('world-staking'); // You can change the database name as needed
    const stakingCollection = db.collection('stakes');

    // Create the new stake object
    const currentDate = new Date();
    const exitDate = new Date(currentDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // Add 7 days
    
    const newStake = {
      stakeAmount: parseFloat(stakeAmount),
      transactionId: transactionId || null,
      timestamp: currentDate.toISOString(), // Format: "2025-06-05T08:43:57.599+00:00"
      exitTimestamp: exitDate.toISOString(), // timestamp + 7 days
    };

    // Check if user already exists
    const existingUser = await stakingCollection.findOne({
      walletAddress: walletAddress,
      username: username
    });

    let result;
    
    if (existingUser) {
      // User exists, add new stake to the stakes array
      result = await stakingCollection.updateOne(
        { walletAddress: walletAddress, username: username },
        { 
          $push: { stakes: newStake } as any,
          $set: { lastStakeAt: new Date() }
        }
      );

      return NextResponse.json(
        { 
          success: true, 
          message: 'New stake added to existing user',
          userId: existingUser._id,
          timestamp: newStake.timestamp,
          exitTimestamp: newStake.exitTimestamp,
          isNewUser: false
        },
        { status: 200 }
      );
    } else {
      // User doesn't exist, create new document with stakes array
      const newUserRecord = {
        walletAddress,
        username,
        stakes: [newStake],
        createdAt: new Date(),
        lastStakeAt: new Date()
      };

      result = await stakingCollection.insertOne(newUserRecord);

      return NextResponse.json(
        { 
          success: true, 
          message: 'New user created with first stake',
          userId: result.insertedId,
          timestamp: newStake.timestamp,
          exitTimestamp: newStake.exitTimestamp,
          isNewUser: true
        },
        { status: 201 }
      );
    }

  } catch (error) {
    console.error('Error creating staking record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Missing required parameter: walletAddress' },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const client = await dbConnect();
    const db = client.db('world-staking');
    const stakingCollection = db.collection('stakes');

    // Find user by wallet address
    const userRecord = await stakingCollection.findOne({
      walletAddress: walletAddress
    });

    if (!userRecord) {
      return NextResponse.json(
        { 
          success: true, 
          message: 'No stakes found for this wallet address',
          stakes: [],
          totalStakes: 0
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Stakes retrieved successfully',
        walletAddress: userRecord.walletAddress,
        username: userRecord.username,
        stakes: userRecord.stakes || [],
        totalStakes: userRecord.stakes ? userRecord.stakes.length : 0,
        createdAt: userRecord.createdAt,
        lastStakeAt: userRecord.lastStakeAt
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error retrieving stakes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 