import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/authOptions";
import connectDB from "@/lib/mongodb";
import { getSignedImageUrl, s3Client } from "@/lib/s3";
import { sanitizeFilename } from "@/lib/utils";
import { checkAdminRole } from "@/lib/auth";

// Import Tag model first to ensure it's registered
import Tag from "@/models/Tag";
// Then import Artwork model which depends on Tag
import Artwork from "@/models/Artwork";
import { DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const artwork = await Artwork.findById(id).populate(
      "categories medium size"
    );

    if (!artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    // Extract the key from the full URL
    const getKeyFromUrl = (url: string) => {
      try {
        const urlObj = new URL(url);
        return urlObj.pathname.slice(1); // Remove leading slash
      } catch {
        return "";
      }
    };

    // Get the S3 keys from the URLs
    const imageKey = getKeyFromUrl(artwork.src);
    const thumbnailKey = getKeyFromUrl(artwork.thumbSrc);

    // Get signed URLs for images
    const imageUrl = imageKey ? await getSignedImageUrl(imageKey) : "";
    const thumbnailUrl = thumbnailKey
      ? await getSignedImageUrl(thumbnailKey)
      : "";

    // Transform the response to match the expected format
    const transformedArtwork = {
      _id: artwork._id,
      title: artwork.name,
      description: artwork.description,
      category: artwork.categories[0]?.label || "Uncategorized",
      medium: artwork.medium?.label || "Mixed Media",
      size: artwork.size?.label || "Unknown",
      dimensions:
        artwork.metaWidth && artwork.metaHeight
          ? `${artwork.metaWidth}x${artwork.metaHeight}`
          : "Unknown",
      year: new Date().getFullYear(),
      imageUrl,
      thumbnailUrl,
      tags: artwork.categories.map((cat: { label: string }) => cat.label),
    };

    return NextResponse.json(transformedArtwork);
  } catch (err) {
    console.error("Error fetching artwork:", err);
    return NextResponse.json(
      { error: "Failed to fetch artwork" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check for admin role
    const adminCheck = await checkAdminRole();
    if (adminCheck) return adminCheck;

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const { id } = await params;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const category = formData.get("category") as string;
    const medium = formData.get("medium") as string;
    const size = formData.get("size") as string;

    await connectDB();

    // First get the existing artwork to check current tags
    const existingArtwork = await Artwork.findById(id).populate(
      "categories medium size"
    );
    if (!existingArtwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    // Create or find tags using findOneAndUpdate with upsert
    const categoryTag = await Tag.findOneAndUpdate(
      {
        label:
          category || existingArtwork.categories[0]?.label || "Uncategorized",
        type: "category",
      },
      {
        label:
          category || existingArtwork.categories[0]?.label || "Uncategorized",
        type: "category",
      },
      { upsert: true, new: true }
    );

    const mediumTag = await Tag.findOneAndUpdate(
      {
        label: medium || existingArtwork.medium?.label || "Mixed Media",
        type: "medium",
      },
      {
        label: medium || existingArtwork.medium?.label || "Mixed Media",
        type: "medium",
      },
      { upsert: true, new: true }
    );

    const sizeTag = await Tag.findOneAndUpdate(
      { label: size || existingArtwork.size?.label || "Unknown", type: "size" },
      { label: size || existingArtwork.size?.label || "Unknown", type: "size" },
      { upsert: true, new: true }
    );

    // Update artwork in MongoDB
    const artwork = await Artwork.findByIdAndUpdate(
      id,
      {
        name: title || existingArtwork.name,
        description: description || existingArtwork.description,
        categories: [categoryTag._id],
        medium: mediumTag._id,
        size: sizeTag._id,
      },
      { new: true }
    ).populate("categories medium size");

    if (!artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    // Transform the response to match the expected format
    const transformedArtwork = {
      _id: artwork._id,
      title: artwork.name,
      description: artwork.description,
      category: artwork.categories[0]?.label || "Uncategorized",
      medium: artwork.medium?.label || "Unknown",
      size: artwork.size?.label || "Unknown",
      dimensions: "Unknown",
      year: new Date().getFullYear(),
      imageUrl: artwork.src,
      thumbnailUrl: artwork.thumbSrc,
      tags: artwork.categories.map((cat: { label: string }) => cat.label),
    };

    return NextResponse.json(transformedArtwork);
  } catch (error) {
    console.error("Error updating artwork:", error);
    return NextResponse.json(
      { error: "Failed to update artwork" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check for admin role
    const adminCheck = await checkAdminRole();
    if (adminCheck) return adminCheck;

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get the ID from params
    const { id } = await params;

    // First get the artwork to get the S3 keys
    const artwork = await Artwork.findById(id);
    if (!artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    // Delete from S3
    try {
      // Extract the filename from the URL and reconstruct the S3 key
      const originalUrl = new URL(artwork.src);
      const thumbnailUrl = new URL(artwork.thumbSrc);

      // Get the pathname and remove leading slash
      const originalPath = originalUrl.pathname.slice(1);
      const thumbnailPath = thumbnailUrl.pathname.slice(1);

      if (originalPath) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
          Key: originalPath,
        });
        await s3Client.send(deleteCommand);
      }

      if (thumbnailPath) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
          Key: thumbnailPath,
        });
        await s3Client.send(deleteCommand);
      }
    } catch (s3Error) {
      console.error("Error deleting from S3:", s3Error);
      // Continue with MongoDB deletion even if S3 deletion fails
    }

    // Delete from MongoDB
    await Artwork.findByIdAndDelete(id);

    return NextResponse.json({ message: "Artwork deleted successfully" });
  } catch (err) {
    console.error("Error deleting artwork:", err);
    return NextResponse.json(
      { error: "Failed to delete artwork" },
      { status: 500 }
    );
  }
}
