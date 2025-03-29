"use client";

import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

interface Artwork {
  _id: string;
  title: string;
  description: string;
  medium: string;
  size: string;
  imageUrl: string;
  category: string;
}

export default function ArtworkPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [allArtworks, setAllArtworks] = useState<Artwork[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Get filter parameters from URL
  const category = searchParams.get("category") || "All";
  const medium = searchParams.get("medium") || "All";
  const size = searchParams.get("size") || "All";

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
        console.error("Error fetching artwork:", error);
        router.push("/gallery");
      } finally {
        setIsLoading(false);
      }
    };

    const fetchAllArtworks = async () => {
      try {
        const response = await fetch("/api/gallery");
        if (!response.ok) {
          throw new Error("Failed to fetch artworks");
        }
        const data = await response.json();
        // Filter artworks based on current filters
        const filteredArtworks = data.artworks.filter((artwork: Artwork) => {
          const matchesCategory =
            category === "All" || artwork.category === category;
          const matchesMedium = medium === "All" || artwork.medium === medium;
          const matchesSize = size === "All" || artwork.size === size;
          return matchesCategory && matchesMedium && matchesSize;
        });
        setAllArtworks(filteredArtworks || []);
      } catch (error) {
        console.error("Error fetching artworks:", error);
      }
    };

    fetchArtwork();
    fetchAllArtworks();
  }, [params.id, router, category, medium, size]);

  // Update current index when artwork or allArtworks changes
  useEffect(() => {
    if (artwork && allArtworks.length > 0) {
      const index = allArtworks.findIndex((a) => a._id === artwork._id);
      if (index !== -1) {
        setCurrentIndex(index);
      } else {
        // If current artwork doesn't match filters, redirect to gallery with current filters
        router.push(
          `/gallery?category=${category}&medium=${medium}&size=${size}`
        );
      }
    }
  }, [artwork, allArtworks, router, category, medium, size]);

  const navigateToArtwork = useCallback(
    (direction: "prev" | "next") => {
      const currentIndex = allArtworks.findIndex((a) => a._id === artwork?._id);
      let newIndex: number;

      if (direction === "prev") {
        newIndex = currentIndex > 0 ? currentIndex - 1 : allArtworks.length - 1;
      } else {
        newIndex = currentIndex < allArtworks.length - 1 ? currentIndex + 1 : 0;
      }

      const nextArtwork = allArtworks[newIndex];
      if (nextArtwork) {
        router.push(
          `/gallery/${nextArtwork._id}?category=${category}&medium=${medium}&size=${size}`
        );
      }
    },
    [allArtworks, artwork, router, category, medium, size]
  );

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        navigateToArtwork("prev");
      } else if (e.key === "ArrowRight") {
        navigateToArtwork("next");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, allArtworks, navigateToArtwork]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!artwork) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="relative aspect-[4/3]">
            {/* Navigation Buttons */}
            <button
              onClick={() => navigateToArtwork("prev")}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors z-10"
              aria-label="Previous artwork"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={() => navigateToArtwork("next")}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors z-10"
              aria-label="Next artwork"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

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
                href={`/gallery?category=${category}&medium=${medium}&size=${size}`}
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
