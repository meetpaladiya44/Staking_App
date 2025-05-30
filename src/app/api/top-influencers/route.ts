import { NextResponse } from "next/server";
import dbConnect from "@/utils/dbConnect";

// Interface for the API response
export interface Influencer {
  id: string;
  name: string;
  followers: number;
  avatar: string;
  recentWeekSignals: number;
  recentWeekTokens: number;
  specialties: string[];
  // Add any other fields that exist in your database
  [key: string]: any; // This allows for additional fields
}

export async function GET() {
  console.time("top-weekly-influencers-api");

  try {
    // Connect to DB once and reuse the connection
    const client = await dbConnect();
    const influencersCollection = client
      .db("influencers_db")
      .collection("influencers");

    // Fetch all documents with all fields (including _id explicitly)
    console.time("fetch-all-influencers");
    const influencersRaw = await influencersCollection
      .find({}, { projection: {} }) // Empty projection includes all fields including _id
      .toArray();
    console.timeEnd("fetch-all-influencers");

    // Transform the data to include id field (convert MongoDB _id to id)
    const influencers = influencersRaw.map(({ _id, ...rest }) => ({
      ...rest,
      id: _id.toString(), // Convert ObjectId to string
    }));

    console.timeEnd("top-weekly-influencers-api");

    return NextResponse.json(
      {
        influencers: influencers,
        count: influencers.length, // Optional: include count
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching influencers:", error);
    console.timeEnd("top-weekly-influencers-api");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}