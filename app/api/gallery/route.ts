import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/authOptions";
import connectDB from "@/lib/mongodb";
import { getSignedImageUrl, s3Client } from "@/lib/s3";
import { sanitizeFilename } from "@/lib/utils";
import { checkAdminRole } from "@/lib/auth";

// Import Tag model first to ensure it's registered
import Tag from "@/models/Tag";
// Then import Artwork model which depends on Tag
import Artwork from "@/models/Artwork";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const category = searchParams.get("category");
    const medium = searchParams.get("medium");
    const size = searchParams.get("size");

    // Build query
    const query: Record<string, unknown> = {};
    if (category) {
      const categoryTag = await Tag.findOne({
        label: category,
        type: "category",
      });
      if (categoryTag) {
        query.categories = categoryTag._id;
      }
    }
    if (medium) {
      const mediumTag = await Tag.findOne({ label: medium, type: "medium" });
      if (mediumTag) {
        query.medium = mediumTag._id;
      }
    }
    if (size) {
      const sizeTag = await Tag.findOne({ label: size, type: "size" });
      if (sizeTag) {
        query.size = sizeTag._id;
      }
    }

    // Get total count for pagination
    const total = await Artwork.countDocuments(query);

    // Get artworks with pagination
    const artworks = await Artwork.find(query)
      .populate("categories medium size")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Transform artworks to include signed URLs
    const transformedArtworks = await Promise.all(
      artworks.map(async (artwork) => {
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

        return {
          _id: artwork._id,
          title: artwork.name,
          description: artwork.description,
          category: artwork.categories[0]?.label || "Uncategorized",
          medium: artwork.medium?.label || "Unknown",
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
      })
    );

    return NextResponse.json({
      artworks: transformedArtworks,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching artworks:", err);
    return NextResponse.json(
      { error: "Failed to fetch artworks" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Check for admin role
    const adminCheck = await checkAdminRole();
    if (adminCheck) return adminCheck;

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const category = formData.get("category") as string;
    const medium = formData.get("medium") as string;
    const size = formData.get("size") as string;
    const image = formData.get("image") as File;

    if (!title || !image) {
      return NextResponse.json(
        { error: "Title and image are required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Create or find tags
    const categoryTag = await Tag.findOneAndUpdate(
      { label: category || "Uncategorized", type: "category" },
      { label: category || "Uncategorized", type: "category" },
      { upsert: true, new: true }
    );

    const mediumTag = await Tag.findOneAndUpdate(
      { label: medium || "Mixed Media", type: "medium" },
      { label: medium || "Mixed Media", type: "medium" },
      { upsert: true, new: true }
    );

    const sizeTag = await Tag.findOneAndUpdate(
      { label: size || "Various", type: "size" },
      { label: size || "Various", type: "size" },
      { upsert: true, new: true }
    );

    // Process image
    const buffer = Buffer.from(await image.arrayBuffer());
    const filename = sanitizeFilename(title);
    const imageKey = `genacourtney/images/${filename}`;
    const thumbnailKey = `genacourtney/images/thumbnails/${filename.replace(
      ".webp",
      "-thumbnail.webp"
    )}`;

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
      Key: imageKey,
      Body: buffer,
      ContentType: "image/webp",
    });
    await s3Client.send(uploadCommand);

    // Create artwork in database
    const artwork = await Artwork.create({
      name: title,
      description: description || "",
      categories: [categoryTag._id],
      medium: mediumTag._id,
      size: sizeTag._id,
      src: `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${imageKey}`,
      thumbSrc: `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${thumbnailKey}`,
    });

    // Transform the response to match the expected format
    const transformedArtwork = {
      _id: artwork._id,
      title: artwork.name,
      description: artwork.description,
      category: categoryTag.label,
      medium: mediumTag.label,
      size: sizeTag.label,
      dimensions: "Unknown",
      year: new Date().getFullYear(),
      imageUrl: artwork.src,
      thumbnailUrl: artwork.thumbSrc,
      tags: [categoryTag.label],
    };

    return NextResponse.json(transformedArtwork);
  } catch (err) {
    console.error("Error creating artwork:", err);
    return NextResponse.json(
      { error: "Failed to create artwork" },
      { status: 500 }
    );
  }
}
