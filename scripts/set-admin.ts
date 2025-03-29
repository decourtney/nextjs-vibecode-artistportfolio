import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function setAdminRole(email: string) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please define the MONGODB_URI environment variable");
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const users = db.collection("users");

    const result = await users.updateOne(
      { email },
      { $set: { role: "admin" } }
    );

    if (result.matchedCount === 0) {
      console.log("No user found with email:", email);
    } else {
      console.log("Successfully set admin role for:", email);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.error("Please provide an email address");
  process.exit(1);
}

setAdminRole(email);
