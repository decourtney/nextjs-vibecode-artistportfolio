import sharp from "sharp";

export function sanitizeFilename(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  // Truncate to 60 characters
  const truncatedName = nameWithoutExt.slice(0, 60);

  // Replace spaces with hyphens and remove any non-alphanumeric characters
  const sanitized = truncatedName
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric characters
    .toLowerCase(); // Convert to lowercase

  return `${sanitized}.webp`;
}

export async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(400, null, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}
