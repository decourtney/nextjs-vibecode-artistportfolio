import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/authOptions";
import connectDB from "@/lib/mongodb";
import mongoose, { Document } from "mongoose";
import { getSignedImageUrl, uploadToS3 } from "@/lib/s3";
import { sanitizeFilename, createThumbnail } from "@/lib/utils";
import { checkAdminRole } from "@/lib/auth";

// Import Tag model first to ensure it's registered
import Tag from "@/models/Tag";
// Then import Artwork model which depends on Tag
import Artwork, { PopulatedArtworkDocument } from "@/models/Artwork";

interface GalleryItemDocument extends Document {
  s3Key: string;
  thumbnailS3Key: string;
  toObject(): any;
}

export async function GET(request: Request) {
  try {
    await connectDB();

    // Get pagination parameters from URL
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const skip = (page - 1) * limit;

    // Ensure models are registered
    if (!mongoose.models.Tag) {
      mongoose.model("Tag", Tag.schema);
    }
    if (!mongoose.models.Artwork) {
      mongoose.model("Artwork", Artwork.schema);
    }

    // Get total count and paginated items
    const [total, items] = await Promise.all([
      Artwork.countDocuments(),
      Artwork.find({})
        .populate("categories medium size")
        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    // Transform the data to match the expected format
    const transformedItems = await Promise.all(
      items.map(async (item: any) => {
        try {
          // Extract the key from the full URL
          const getKeyFromUrl = (url: string) => {
            try {
              const urlObj = new URL(url);
              return urlObj.pathname.slice(1); // Remove leading slash
            } catch (e) {
              return "";
            }
          };

          // Get the S3 keys from the URLs
          const imageKey = getKeyFromUrl(item.src);
          const thumbnailKey = getKeyFromUrl(item.thumbSrc);

          // Get signed URLs for images
          const imageUrl = imageKey ? await getSignedImageUrl(imageKey) : "";
          const thumbnailUrl = thumbnailKey
            ? await getSignedImageUrl(thumbnailKey)
            : "";

          // Ensure all required fields have fallback values
          const transformedItem = {
            _id: item._id || "",
            title: item.name || "Untitled",
            description: item.description || "",
            category:
              Array.isArray(item.categories) && item.categories.length > 0
                ? item.categories[0].label
                : "Uncategorized",
            medium: item.medium?.label || "Unknown",
            size: item.size?.label || "Unknown",
            dimensions:
              item.metaWidth && item.metaHeight
                ? `${item.metaWidth}x${item.metaHeight}`
                : "Unknown",
            year: new Date().getFullYear(),
            imageUrl,
            thumbnailUrl,
            tags: Array.isArray(item.categories)
              ? item.categories.map((cat: { label: string }) => cat.label)
              : [],
          };

          return transformedItem;
        } catch (transformError) {
          return null;
        }
      })
    );

    // Filter out any null items from transformation errors
    const validItems = transformedItems.filter(
      (item): item is NonNullable<typeof item> => item !== null
    );

    return NextResponse.json({
      artworks: validItems,
      total,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch gallery items" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Check for admin role
    const adminCheck = await checkAdminRole();
    if (adminCheck) return adminCheck;

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const dataStr = formData.get("data") as string;
    const isBatchUpload = formData.get("isBatchUpload") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    let data;
    try {
      data = JSON.parse(dataStr);
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid data format" },
        { status: 400 }
      );
    }

    await connectDB();

    // Sanitize the filename - for batch uploads, use the original filename
    const sanitizedFilename = sanitizeFilename(
      isBatchUpload ? file.name : data.title || file.name
    );

    const key = `genacourtney/images/${sanitizedFilename}`;
    const thumbnailKey = `genacourtney/images/thumbnails/${sanitizedFilename.replace(
      ".webp",
      "-thumbnail.webp"
    )}`;

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Create thumbnail
    const thumbnailBuffer = await createThumbnail(buffer);

    // Upload original file to S3
    const uploadSuccess = await uploadToS3(buffer, key, "image/webp");

    if (!uploadSuccess) {
      return NextResponse.json(
        { error: "Failed to upload file to S3" },
        { status: 500 }
      );
    }

    // Upload thumbnail to S3
    const thumbnailUploadSuccess = await uploadToS3(
      thumbnailBuffer,
      thumbnailKey,
      "image/webp"
    );

    if (!thumbnailUploadSuccess) {
      return NextResponse.json(
        { error: "Failed to upload thumbnail to S3" },
        { status: 500 }
      );
    }

    // Create or find tags with default values if not provided
    const categoryTag = await Tag.findOneAndUpdate(
      { label: data.category || "Uncategorized", type: "category" },
      { label: data.category || "Uncategorized", type: "category" },
      { upsert: true, new: true }
    );

    const mediumTag = await Tag.findOneAndUpdate(
      { label: data.medium || "Mixed Media", type: "medium" },
      { label: data.medium || "Mixed Media", type: "medium" },
      { upsert: true, new: true }
    );

    const sizeTag = await Tag.findOneAndUpdate(
      { label: data.size || "Various", type: "size" },
      { label: data.size || "Various", type: "size" },
      { upsert: true, new: true }
    );

    // Create artwork in MongoDB
    const artwork = await Artwork.create({
      name: data.title || file.name.replace(/\.[^/.]+$/, ""),
      description: data.description || "",
      src: `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${key}`,
      thumbSrc: `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${thumbnailKey}`,
      categories: [categoryTag._id],
      medium: mediumTag._id,
      size: sizeTag._id,
      metaWidth: 0,
      metaHeight: 0,
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
      year: data.year || "",
      imageUrl: artwork.src,
      thumbnailUrl: artwork.thumbSrc,
      tags: [categoryTag.label],
    };

    return NextResponse.json(transformedArtwork);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create artwork" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const data = JSON.parse(formData.get("data") as string);

    await connectDB();

    // Create or find tags
    const categoryTag = await Tag.findOneAndUpdate(
      { label: data.category, type: "category" },
      { label: data.category, type: "category" },
      { upsert: true, new: true }
    );

    const mediumTag = await Tag.findOneAndUpdate(
      { label: data.medium, type: "medium" },
      { label: data.medium, type: "medium" },
      { upsert: true, new: true }
    );

    const sizeTag = await Tag.findOneAndUpdate(
      { label: data.size, type: "size" },
      { label: data.size, type: "size" },
      { upsert: true, new: true }
    );

    // Update artwork in MongoDB
    const artwork = await Artwork.findByIdAndUpdate(
      params.id,
      {
        name: data.title,
        description: data.description,
        categories: [categoryTag._id],
        medium: mediumTag._id,
        size: sizeTag._id,
        metaWidth: 0,
        metaHeight: 0,
      },
      { new: true }
    );

    if (!artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    // Transform the response to match the expected format
    const transformedArtwork = {
      _id: artwork._id,
      title: artwork.name,
      description: artwork.description,
      category: categoryTag.label,
      medium: mediumTag.label,
      size: sizeTag.label,
      dimensions: "Unknown",
      year: data.year,
      imageUrl: artwork.src,
      thumbnailUrl: artwork.thumbSrc,
      tags: [categoryTag.label],
    };

    return NextResponse.json(transformedArtwork);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update artwork" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const artwork = await Artwork.findByIdAndDelete(params.id);

    if (!artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete artwork" },
      { status: 500 }
    );
  }
}
