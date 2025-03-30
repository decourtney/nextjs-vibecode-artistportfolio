import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/authOptions";
import { connectDB } from "../../../lib/db";
import { s3Client } from "@/lib/s3";
import { sanitizeFilename, createThumbnail } from "@/lib/utils";
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
    const offset = (page - 1) * limit;

    const artworks = await Artwork.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    const total = await Artwork.countDocuments();

    const hasMore = offset + artworks.length < total;

    // Transform artworks to include proper image URLs
    const transformedArtworks = artworks.map((artwork) => ({
      _id: artwork._id,
      title: artwork.name || "",
      description: artwork.description || "",
      category: artwork.categories?.[0]?.label || "Uncategorized",
      medium: artwork.medium?.label || "Unknown",
      size: artwork.size?.label || "Unknown",
      dimensions:
        artwork.metaWidth && artwork.metaHeight
          ? `${artwork.metaWidth}x${artwork.metaHeight}`
          : "Unknown",
      year: new Date().getFullYear(),
      imageUrl: artwork.src || "",
      thumbnailUrl: artwork.thumbSrc || "",
      tags: Array.isArray(artwork.categories)
        ? artwork.categories.map((cat: { label: string }) => cat.label)
        : [],
    }));

    // Filter out artworks with invalid image URLs
    const validArtworks = transformedArtworks.filter(
      (artwork) =>
        artwork.imageUrl &&
        artwork.imageUrl.trim() !== "" &&
        artwork.thumbnailUrl &&
        artwork.thumbnailUrl.trim() !== ""
    );

    return NextResponse.json({
      artworks: validArtworks,
      total,
      hasMore,
      returnedCount: validArtworks.length,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching artworks:", error);
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

    if (!image) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
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
      { label: size || "Unknown", type: "size" },
      { label: size || "Unknown", type: "size" },
      { upsert: true, new: true }
    );

    // Process image
    const buffer = Buffer.from(await image.arrayBuffer());
    const filename = sanitizeFilename(
      title || image.name.replace(/\.[^/.]+$/, "")
    );
    const imageKey = `genacourtney/images/${filename}.webp`;
    const thumbnailKey = `genacourtney/images/thumbnails/${filename}-thumbnail.webp`;

    try {
      // Create thumbnail
      const thumbnailBuffer = await createThumbnail(buffer);

      // Upload original image to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
        Key: imageKey,
        Body: buffer,
        ContentType: "image/webp",
      });
      await s3Client.send(uploadCommand);

      // Upload thumbnail to S3
      const thumbnailCommand = new PutObjectCommand({
        Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: "image/webp",
      });
      await s3Client.send(thumbnailCommand);

      // Create artwork in database
      const artwork = await Artwork.create({
        name: (title || filename).slice(0, 60),
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
    } catch (error) {
      console.error("Error processing image:", error);
      return NextResponse.json(
        { error: "Failed to process image" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error creating artwork:", error);
    return NextResponse.json(
      { error: "Failed to create artwork" },
      { status: 500 }
    );
  }
}
