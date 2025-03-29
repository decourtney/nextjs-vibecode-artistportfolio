export interface Artwork {
  _id: string;
  title: string;
  description: string;
  category: string;
  medium: string;
  size: string;
  dimensions: string;
  year?: number;
  imageUrl: string;
  thumbnailUrl: string;
  tags: string[];
}
