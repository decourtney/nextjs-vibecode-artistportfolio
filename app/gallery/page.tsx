"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useInView } from "react-intersection-observer";
import { useSession } from "next-auth/react";

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
  const { data: session } = useSession();
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
  const { ref, inView } = useInView({
    threshold: 0,
  });

  // Load filter options and artworks on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load artworks
        const artworksResponse = await fetch("/api/gallery");
        if (!artworksResponse.ok) {
          throw new Error("Failed to fetch artworks");
        }
        const artworksData = await artworksResponse.json();
        setArtworks(artworksData.artworks || []);

        // Load filter options
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
          error instanceof Error ? error.message : "Failed to load data"
        );
        setArtworks([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredItems = artworks.filter((item) => {
    const categoryMatch =
      selectedCategory === "All" || item.category === selectedCategory;
    const mediumMatch =
      selectedMedium === "All" || item.medium === selectedMedium;
    const sizeMatch = selectedSize === "All" || item.size === selectedSize;
    return categoryMatch && mediumMatch && sizeMatch;
  });

  const displayedItems = filteredItems.slice(0, page * ITEMS_PER_PAGE);

  // Handle infinite scroll and filter changes
  useEffect(() => {
    if (inView && displayedItems.length < filteredItems.length) {
      setPage((prev) => prev + 1);
    }
  }, [inView, filteredItems.length, displayedItems.length]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, selectedMedium, selectedSize]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

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
          {displayedItems.map((item, index) => (
            <Link
              key={item._id}
              href={`/gallery/${item._id}?category=${selectedCategory}&medium=${selectedMedium}&size=${selectedSize}`}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 block break-inside-avoid"
            >
              <div className="relative w-full">
                <Image
                  src={item.thumbnailUrl}
                  alt={item.title}
                  width={800}
                  height={600}
                  className="w-full h-auto object-contain"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  priority={index < 6}
                />
              </div>
            </Link>
          ))}
        </div>

        {/* Infinite scroll trigger */}
        {displayedItems.length < filteredItems.length && (
          <div ref={ref} className="h-10" />
        )}
      </div>
    </div>
  );
}
