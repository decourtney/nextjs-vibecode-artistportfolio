import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Tag from "@/models/Tag";

export async function GET(request: Request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return NextResponse.json(
        { error: "Type parameter is required" },
        { status: 400 }
      );
    }

    const tags = await Tag.find({ type }).sort("label");
    return NextResponse.json(tags);
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
