// Adjust this based on your actual implementation
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI!;

// Use connection caching for better performance in serverless environments
let cachedClient: MongoClient | null = null;

export default async function dbConnect(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient;
  }

  try {
    // Set server timeout options
    const options = {
      connectTimeoutMS: 5000,
      socketTimeoutMS: 8000,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      minPoolSize: 5
    };

    const client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    cachedClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}