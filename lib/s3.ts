import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (
  !process.env.AWS_ACCESS_KEY_ID ||
  !process.env.AWS_SECRET_ACCESS_KEY ||
  !process.env.NEXT_PUBLIC_AWS_REGION ||
  !process.env.NEXT_PUBLIC_AWS_S3_BUCKET
) {
  throw new Error("Missing AWS credentials in environment variables");
}

const s3Client = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export { s3Client };

export async function uploadToS3(
  file: Buffer,
  key: string,
  contentType: string
) {
  const command = new PutObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
    Key: key,
    Body: file,
    ContentType: contentType,
  });

  try {
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    return false;
  }
}

export async function getSignedImageUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET,
    Key: key,
  });

  try {
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    console.error("Error getting signed URL:", error);
    return null;
  }
}
