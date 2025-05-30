import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/utils/dbConnect";
import { ObjectId } from "mongodb";

export async function POST(request: NextRequest) {
  console.time("subscribe-api");

  try {
    // Parse request body
    const body = await request.json();
    const { influencerId, username } = body;

    if (!influencerId ) {
      return NextResponse.json(
        { error: "Influencer ID is required" },
        { status: 400 }
      );
    }

    if (!username ) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(influencerId)) {
      return NextResponse.json(
        { error: "Invalid influencer ID format" },
        { status: 400 }
      );
    }

    // Connect to database
    const client = await dbConnect();
    const influencersCollection = client
      .db("influencers_db")
      .collection("influencers");

    console.time("check-influencer-exists");
    // Check if influencer exists - using ObjectId.createFromHexString for newer MongoDB drivers
    const objectId = ObjectId.createFromHexString(influencerId);
    const influencer = await influencersCollection.findOne({
      _id: objectId,
    });

    if (!influencer) {
      console.timeEnd("check-influencer-exists");
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 }
      );
    }
    console.timeEnd("check-influencer-exists");

    console.time("update-subscribers");
    // Add username to subscribers array (avoid duplicates using $addToSet)
    const updateResult = await influencersCollection.updateOne(
      { _id: objectId },
      {
        $addToSet: { subscribers: username },
      }
    );
    console.timeEnd("update-subscribers");

    // Check if the update was successful
    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 }
      );
    }

    // Check if user was already subscribed
    if (updateResult.modifiedCount === 0) {
      return NextResponse.json(
        {
          message: "Already subscribed to this influencer",
          influencerName: influencer.name,
        },
        { status: 200 }
      );
    }

    console.timeEnd("subscribe-api");

    return NextResponse.json(
      {
        message: "Successfully subscribed to influencer",
        influencerName: influencer.name,
        subscriber: username,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in subscribe API:", error);
    console.timeEnd("subscribe-api");

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
