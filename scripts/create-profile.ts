import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Profile from "../models/Profile";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function createProfile(email: string) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please define the MONGODB_URI environment variable");
  }

  try {
    await mongoose.connect(uri);

    // First, get the user's ID from the users collection
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();
    const users = db.collection("users");
    const user = await users.findOne({ email });

    if (!user) {
      console.log("No user found with email:", email);
      return;
    }

    // Create or update the profile
    const profile = await Profile.findOneAndUpdate(
      { authId: user._id.toString() },
      {
        username: email.split("@")[0],
        role: "admin",
        authId: user._id.toString(),
      },
      { upsert: true, new: true }
    );

    await client.close();
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.error("Please provide an email address");
  process.exit(1);
}

createProfile(email);
