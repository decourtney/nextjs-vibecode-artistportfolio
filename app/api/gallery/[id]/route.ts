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

    const data = await request.json();
    await connectDB();

    // Get the ID from params
    const { id } = await params;

    // First get the existing artwork to check if title changed
    const existingArtwork = await Artwork.findById(id);
    if (!existingArtwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    // Create or find tags
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

    // If title changed, update S3 filenames
    if (data.title !== existingArtwork.name) {
      try {
        // Extract current filenames
        const originalUrl = new URL(existingArtwork.src);
        const thumbnailUrl = new URL(existingArtwork.thumbSrc);

        // Get the pathname and remove leading slash
        const originalPath = originalUrl.pathname.slice(1);
        const thumbnailPath = thumbnailUrl.pathname.slice(1);

        // Create new filenames based on new title
        const newFilename = sanitizeFilename(data.title);
        const newImageKey = `genacourtney/images/${newFilename}`;
        const newThumbnailKey = `genacourtney/images/thumbnails/${newFilename.replace(
          ".webp",
          "-thumbnail.webp"
        )}`;

        // Copy files to new locations
        const copyCommand = new CopyObjectCommand({
          Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
          CopySource: `${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}/${originalPath}`,
          Key: newImageKey,
        });
        await s3Client.send(copyCommand);

        const copyThumbnailCommand = new CopyObjectCommand({
          Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
          CopySource: `${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}/${thumbnailPath}`,
          Key: newThumbnailKey,
        });
        await s3Client.send(copyThumbnailCommand);

        // Only delete old files after successful copy
        try {
          const deleteOriginalCommand = new DeleteObjectCommand({
            Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
            Key: originalPath,
          });
          await s3Client.send(deleteOriginalCommand);

          const deleteThumbnailCommand = new DeleteObjectCommand({
            Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
            Key: thumbnailPath,
          });
          await s3Client.send(deleteThumbnailCommand);
        } catch (deleteError) {
          console.error("Error deleting old files:", deleteError);
          // Continue even if deletion fails, as the files are already copied
        }

        // Update artwork with new URLs
        const artwork = await Artwork.findByIdAndUpdate(
          id,
          {
            name: data.title,
            description: data.description || "",
            categories: [categoryTag._id],
            medium: mediumTag._id,
            size: sizeTag._id,
            src: `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${newImageKey}`,
            thumbSrc: `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${newThumbnailKey}`,
          },
          { new: true }
        );

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
      } catch (s3Error) {
        console.error("Error updating S3 files:", s3Error);
        return NextResponse.json(
          { error: "Failed to update S3 files" },
          { status: 500 }
        );
      }
    } else {
      // If title didn't change, just update other fields
      const artwork = await Artwork.findByIdAndUpdate(
        id,
        {
          name: data.title,
          description: data.description || "",
          categories: [categoryTag._id],
          medium: mediumTag._id,
          size: sizeTag._id,
        },
        { new: true }
      );

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
    }
  } catch (err) {
    console.error("Error updating artwork:", err);
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
