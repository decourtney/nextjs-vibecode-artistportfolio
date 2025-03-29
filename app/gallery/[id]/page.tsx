"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Artwork {
  _id: string;
  title: string;
  description: string;
  medium: string;
  size: string;
  imageUrl: string;
}

export default function GalleryItem() {
  const params = useParams();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArtwork = async () => {
      try {
        const response = await fetch(`/api/gallery/${params.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch artwork");
        }
        const data = await response.json();
        setArtwork(data);
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Failed to load artwork"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchArtwork();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            {error || "Artwork not found"}
          </h2>
          <a
            href="/gallery"
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 inline-block"
          >
            Back to Gallery
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="relative aspect-[4/3]">
            <Image
              src={artwork.imageUrl}
              alt={artwork.title}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
              priority
            />
          </div>
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {artwork.title}
                </h1>
                <p className="text-gray-600">{artwork.medium}</p>
                <p className="text-gray-600">{artwork.size}</p>
              </div>
              <a
                href="/gallery"
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Back to Gallery
              </a>
            </div>
            <p className="text-gray-600 whitespace-pre-wrap">
              {artwork.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
