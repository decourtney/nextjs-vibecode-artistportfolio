"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useInView } from "react-intersection-observer";
import { toast } from "sonner";

interface Artwork {
  _id: string;
  title: string;
  description: string;
  category: string;
  medium: string;
  size: string;
  dimensions: string;
  year: number;
  imageUrl: string;
  thumbnailUrl: string;
  tags: string[];
}

const ITEMS_PER_PAGE = 12;

export default function Gallery() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedMedium, setSelectedMedium] = useState("All");
  const [selectedSize, setSelectedSize] = useState("All");
  const [page, setPage] = useState(1);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [mediums, setMediums] = useState<string[]>(["All"]);
  const [sizes, setSizes] = useState<string[]>(["All"]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { ref, inView } = useInView({
    threshold: 0,
  });

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [categoriesResponse, mediumsResponse, sizesResponse] =
          await Promise.all([
            fetch("/api/tags?type=category"),
            fetch("/api/tags?type=medium"),
            fetch("/api/tags?type=size"),
          ]);

        if (
          !categoriesResponse.ok ||
          !mediumsResponse.ok ||
          !sizesResponse.ok
        ) {
          throw new Error("Failed to fetch filter options");
        }

        const [categoriesData, mediumsData, sizesData] = await Promise.all([
          categoriesResponse.json(),
          mediumsResponse.json(),
          sizesResponse.json(),
        ]);

        setCategories([
          "All",
          ...categoriesData.map((tag: { label: string }) => tag.label),
        ]);
        setMediums([
          "All",
          ...mediumsData.map((tag: { label: string }) => tag.label),
        ]);
        setSizes([
          "All",
          ...sizesData.map((tag: { label: string }) => tag.label),
        ]);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to load filter options"
        );
      }
    };
    loadFilterOptions();
  }, []);

  const loadArtworks = useCallback(async () => {
    try {
      if (page === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const response = await fetch(
        `/api/gallery?page=${page}&limit=${ITEMS_PER_PAGE}${
          selectedCategory !== "All" ? `&category=${selectedCategory}` : ""
        }${selectedMedium !== "All" ? `&medium=${selectedMedium}` : ""}${
          selectedSize !== "All" ? `&size=${selectedSize}` : ""
        }`
      );
      if (!response.ok) throw new Error("Failed to fetch artworks");
      const data = await response.json();

      // If it's the first page, replace the artworks
      // Otherwise, append to existing artworks
      setArtworks((prev) => {
        if (page === 1) return data.artworks;

        // Check for duplicates before adding new artworks
        const newArtworks = data.artworks.filter(
          (newArtwork: Artwork) =>
            !prev.some((existing) => existing._id === newArtwork._id)
        );

        return [...prev, ...newArtworks];
      });

      // Set hasMore based on whether we've reached the total number of artworks
      // Compare the current number of loaded artworks with the total from the API
      const currentLoadedCount = page * ITEMS_PER_PAGE;
      setHasMore(currentLoadedCount < data.total);
    } catch (error) {
      console.error("Error loading artworks:", error);
      toast.error("Failed to load artworks");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [page, selectedCategory, selectedMedium, selectedSize]);

  // Reset page and artworks when filters change
  useEffect(() => {
    setPage(1);
    setArtworks([]);
    setHasMore(true);
  }, [selectedCategory, selectedMedium, selectedSize]);

  // Load artworks when page or filters change
  useEffect(() => {
    loadArtworks();
  }, [loadArtworks]);

  // Handle infinite scroll
  useEffect(() => {
    if (inView && !isLoading && !isLoadingMore && hasMore) {
      setPage((prev) => prev + 1);
    }
  }, [inView, isLoading, isLoadingMore, hasMore]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Error Loading Gallery
          </h2>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Category
            </label>
            <select
              id="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="medium"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Medium
            </label>
            <select
              id="medium"
              value={selectedMedium}
              onChange={(e) => setSelectedMedium(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              {mediums.map((medium) => (
                <option key={medium} value={medium}>
                  {medium}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="size"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Size
            </label>
            <select
              id="size"
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Artwork Grid */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
          {artworks.map((artwork: Artwork, index: number) => (
            <Link
              key={artwork._id}
              href={`/gallery/${artwork._id}?category=${selectedCategory}&medium=${selectedMedium}&size=${selectedSize}`}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 block break-inside-avoid"
            >
              <div className="relative w-full">
                {artwork.thumbnailUrl && artwork.thumbnailUrl.trim() !== "" ? (
                  <Image
                    src={artwork.thumbnailUrl}
                    alt={artwork.title}
                    width={800}
                    height={600}
                    className="w-full h-auto object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    priority={index < 6}
                  />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center bg-gray-100">
                    <span className="text-gray-400">No image available</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-1 truncate">
                  {artwork.title}
                </h3>
                <p className="text-sm text-gray-600 mb-1 truncate">
                  {artwork.category}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {artwork.medium} • {artwork.size}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Loading indicators */}
        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        )}
        {isLoadingMore && (
          <div className="flex justify-center items-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          </div>
        )}

        {/* Infinite scroll trigger */}
        {!isLoading && !isLoadingMore && hasMore && (
          <div ref={ref} className="h-10" />
        )}
      </div>
    </div>
  );
}
