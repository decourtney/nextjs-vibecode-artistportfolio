"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Artwork } from "@/types/gallery";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import TagManager from "../components/TagManager";
import { useInView } from "react-intersection-observer";

const artworkSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  medium: z.string().optional(),
  size: z.string().optional(),
  year: z.string().optional(),
});

type ArtworkFormData = z.infer<typeof artworkSchema>;

interface DashboardTag {
  _id: string;
  label: string;
  type: "category" | "medium" | "size";
}

interface GalleryResponse {
  artworks: Artwork[];
  total: number;
  hasMore: boolean;
  returnedCount: number;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [totalArtworks, setTotalArtworks] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArtworks, setSelectedArtworks] = useState<string[]>([]);
  const [categories, setCategories] = useState<DashboardTag[]>([]);
  const [mediums, setMediums] = useState<DashboardTag[]>([]);
  const [sizes, setSizes] = useState<DashboardTag[]>([]);
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isBatchUpload, setIsBatchUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const ITEMS_PER_PAGE = 20;
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "100px",
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ArtworkFormData>({
    resolver: zodResolver(artworkSchema),
  });

  const loadArtworks = useCallback(async () => {
    try {
      if (offset === 0) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const page = Math.floor(offset / ITEMS_PER_PAGE) + 1;
      const response = await fetch(
        `/api/gallery?page=${page}&limit=${ITEMS_PER_PAGE}`
      );
      if (!response.ok) throw new Error("Failed to fetch artworks");
      const data: GalleryResponse = await response.json();



      // Set total artworks count
      setTotalArtworks(data.total);

      // If it's the first load, replace the artworks
      // Otherwise, append to existing artworks
      setArtworks((prev) => {
        if (offset === 0) {
          return data.artworks;
        }

        // Check for duplicates before adding new artworks
        const newArtworks = data.artworks.filter(
          (newArtwork: Artwork) =>
            !prev.some((existing) => existing._id === newArtwork._id)
        );

        const updatedArtworks = [...prev, ...newArtworks];
        return updatedArtworks;
      });

      // Set hasMore based on the API response
      setHasMore(data.hasMore);

      // If we got fewer items than requested, we've reached the end
      if (data.returnedCount < ITEMS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading artworks:", error);
      toast.error("Failed to load artworks");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [offset]);

  // Handle infinite scroll
  useEffect(() => {
    if (inView && !isLoading && !isLoadingMore && hasMore) {
      const nextOffset = offset + ITEMS_PER_PAGE;
      if (nextOffset < totalArtworks) {
        setOffset(nextOffset);
      }
    }
  }, [inView, isLoading, isLoadingMore, hasMore, offset, totalArtworks]);

  // Load artworks when offset changes
  useEffect(() => {
    if (offset >= 0) {
      loadArtworks();
    }
  }, [offset, loadArtworks]);

  // Reset offset when component mounts
  useEffect(() => {
    setOffset(0);
    setArtworks([]);
    setHasMore(true);
    loadTags(); // Load tags when component mounts
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  // Load artworks when session is available
  useEffect(() => {
    if (session && offset === 0) {
      loadArtworks();
    }
  }, [session, loadArtworks, offset]);

  // Debug render

  const loadTags = async () => {
    try {
      const [categoriesRes, mediumsRes, sizesRes] = await Promise.all([
        fetch("/api/tags?type=category"),
        fetch("/api/tags?type=medium"),
        fetch("/api/tags?type=size"),
      ]);

      if (!categoriesRes.ok || !mediumsRes.ok || !sizesRes.ok) {
        throw new Error("Failed to fetch tags");
      }

      const [categoriesData, mediumsData, sizesData] = await Promise.all([
        categoriesRes.json(),
        mediumsRes.json(),
        sizesRes.json(),
      ]);

      setCategories(categoriesData || []);
      setMediums(mediumsData || []);
      setSizes(sizesData || []);
    } catch (error) {
      console.error("Error loading tags:", error);
      toast.error("Failed to load tags");
    }
  };

  const resetForm = () => {
    // Reset all form fields to empty values
    reset({
      title: "",
      description: "",
      category: "",
      medium: "",
      size: "",
      year: "",
    });
    setIsEditing(false);
    setEditingArtwork(null);
    setIsBatchUpload(false);
    setUploadProgress(0);
    setTotalFiles(0);
    setProcessedFiles(0);
    // Clear the file input
    const fileInput = document.getElementById("file") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const onSubmitForm = async (data: ArtworkFormData) => {
    if (isEditing && editingArtwork) {
      // Handle update
      try {
        setIsUploading(true);
        const formDataToSend = new FormData();
        formDataToSend.append("title", data.title || editingArtwork.title);
        formDataToSend.append(
          "description",
          data.description || editingArtwork.description
        );
        // Only append category, medium, and size if they have values
        if (data.category) formDataToSend.append("category", data.category);
        if (data.medium) formDataToSend.append("medium", data.medium);
        if (data.size) formDataToSend.append("size", data.size);

        const response = await fetch(`/api/gallery/${editingArtwork._id}`, {
          method: "PUT",
          body: formDataToSend,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to update artwork");
        }

        toast.success("Artwork updated successfully");
        loadArtworks();
        resetForm();
      } catch (error) {
        console.error("Error updating artwork:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to update artwork"
        );
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Handle new upload
    const fileInput = document.getElementById("file") as HTMLInputElement;
    const files = fileInput?.files;

    if (!files?.length) {
      toast.error("Please select at least one file");
      return;
    }

    try {
      setIsUploading(true);
      setTotalFiles(files.length);
      setProcessedFiles(0);
      let successCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formDataToSend = new FormData();
        formDataToSend.append(
          "title",
          isBatchUpload ? file.name.replace(/\.[^/.]+$/, "") : data.title || ""
        );
        formDataToSend.append("description", data.description || "");
        // Only append category, medium, and size if they have values
        if (data.category) formDataToSend.append("category", data.category);
        if (data.medium) formDataToSend.append("medium", data.medium);
        if (data.size) formDataToSend.append("size", data.size);
        formDataToSend.append("image", file);

        const response = await fetch("/api/gallery", {
          method: "POST",
          body: formDataToSend,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to upload ${file.name}`);
        }

        successCount++;
        setProcessedFiles(i + 1);
        setUploadProgress(((i + 1) / files.length) * 100);
      }

      if (successCount > 0) {
        toast.success(
          `Successfully uploaded ${successCount} of ${files.length} artworks`
        );
        resetForm();
        loadArtworks();
      }
    } catch (error) {
      console.error("Error uploading artwork:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload artwork"
      );
    } finally {
      setIsUploading(false);
      setTotalFiles(0);
      setProcessedFiles(0);
      setUploadProgress(0);
    }
  };

  const handleEdit = (artwork: Artwork) => {
    setEditingArtwork(artwork);
    setIsEditing(true);
    // Reset form with artwork data
    reset({
      title: artwork.title || "",
      description: artwork.description || "",
      category: artwork.category || "",
      medium: artwork.medium || "",
      size: artwork.size || "",
      year: artwork.year?.toString() || "",
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this artwork?")) return;

    try {
      const response = await fetch(`/api/gallery/${id}`, {
        method: "DELETE",
      });

      let errorMessage = "Failed to delete artwork";
      try {
        const responseData = await response.json();
        if (responseData.error) {
          errorMessage = responseData.error;
        }
      } catch (error) {
        console.error("Error deleting artwork:", error);
      }

      if (!response.ok) {
        if (response.status === 403) {
          toast.error(
            "You don't have permission to perform this action. Please contact an administrator."
          );
        } else {
          toast.error(errorMessage);
        }
        return;
      }

      toast.success("Artwork deleted successfully");
      loadArtworks();
    } catch (error) {
      console.error("Error deleting artwork:", error);
      toast.error("Failed to delete artwork");
    }
  };

  const toggleArtworkSelection = (artworkId: string) => {
    setSelectedArtworks((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(artworkId)) {
        newSelection.delete(artworkId);
      } else {
        newSelection.add(artworkId);
      }
      return Array.from(newSelection);
    });
  };

  const handleBatchDelete = async () => {
    if (selectedArtworks.length === 0) {
      toast.error("Please select at least one artwork to delete");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete ${selectedArtworks.length} artworks?`
      )
    )
      return;

    try {
      const deletePromises = selectedArtworks.map((id) =>
        fetch(`/api/gallery/${id}`, {
          method: "DELETE",
        }).then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 403) {
              throw new Error(
                "You don't have permission to perform this action. Please contact an administrator."
              );
            }
            throw new Error(errorData.error || "Failed to delete artwork");
          }
          return true;
        })
      );

      const results = await Promise.allSettled(deletePromises);
      const successCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      const failureCount = results.filter(
        (r) => r.status === "rejected"
      ).length;

      // Check if any failures were due to permission issues
      const permissionErrors = results.filter(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof Error &&
          r.reason.message.includes("don't have permission")
      );

      if (permissionErrors.length > 0) {
        toast.error(
          "You don't have permission to perform this action. Please contact an administrator."
        );
        return;
      }

      if (successCount > 0) {
        toast.success(
          `Successfully deleted ${successCount} artwork${
            successCount !== 1 ? "s" : ""
          }`
        );
        setSelectedArtworks([]);
        loadArtworks();
      }

      if (failureCount > 0 && permissionErrors.length === 0) {
        toast.error(
          `Failed to delete ${failureCount} artwork${
            failureCount !== 1 ? "s" : ""
          }`
        );
      }
    } catch (error) {
      console.error("Error deleting artworks:", error);
      if (
        error instanceof Error &&
        error.message.includes("don't have permission")
      ) {
        toast.error(error.message);
      } else {
        toast.error("Failed to delete artworks");
      }
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* User Info */}
        {session?.user && (
          <div className="mb-6 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <div className="text-sm text-gray-600">
              Logged in as: {session.user.name || session.user.email}
            </div>
          </div>
        )}

        {/* Tag Management Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Tag Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TagManager
              type="category"
              title="Categories"
              onTagsChange={loadTags}
            />
            <TagManager type="medium" title="Mediums" onTagsChange={loadTags} />
            <TagManager type="size" title="Sizes" onTagsChange={loadTags} />
          </div>
        </div>

        <div className="flex justify-end items-center mb-8">
          <div className="space-x-4">
            <button
              onClick={() => {
                resetForm();
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Single Upload
            </button>
            <button
              onClick={() => {
                resetForm();
                setIsBatchUpload(true);
              }}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
            >
              Batch Upload
            </button>
          </div>
        </div>

        {(isEditing || !editingArtwork || isBatchUpload) && (
          <form
            onSubmit={handleSubmit(onSubmitForm)}
            className="bg-white p-6 rounded-lg shadow-md mb-8"
          >
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isBatchUpload ? "Select Multiple Images" : "Image"}
                </label>
                <input
                  type="file"
                  id="file"
                  accept="image/*"
                  multiple={isBatchUpload}
                  className="w-full p-2 border rounded"
                  required={!isEditing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // File is handled directly in onSubmitForm
                    }
                  }}
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {!isBatchUpload && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    {...register("title")}
                    className="w-full p-2 border rounded"
                  />
                  {errors.title && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.title.message}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  {...register("description")}
                  className="w-full p-2 border rounded"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  {...register("category")}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat.label}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.category.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Medium
                </label>
                <select
                  {...register("medium")}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select a medium</option>
                  {mediums.map((med) => (
                    <option key={med._id} value={med.label}>
                      {med.label}
                    </option>
                  ))}
                </select>
                {errors.medium && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.medium.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Size
                </label>
                <select
                  {...register("size")}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select a size</option>
                  {sizes.map((size) => (
                    <option key={size._id} value={size.label}>
                      {size.label}
                    </option>
                  ))}
                </select>
                {errors.size && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.size.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year
                </label>
                <input
                  type="text"
                  {...register("year")}
                  className="w-full p-2 border rounded"
                  placeholder="YYYY"
                />
              </div>
            </div>

            {isUploading && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Uploading {processedFiles} of {totalFiles} files (
                  {Math.round(uploadProgress)}%)
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isUploading}
              className="mt-6 bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 disabled:opacity-50"
            >
              {isUploading
                ? "Uploading..."
                : editingArtwork
                ? "Update Artwork"
                : isBatchUpload
                ? "Upload Files"
                : "Upload Artwork"}
            </button>
          </form>
        )}

        <div className="mt-8">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : !artworks?.length ? (
            <div className="text-center text-gray-500">No artworks found</div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <div className="text-sm text-gray-600">
                  Total Artworks: {totalArtworks} (Loaded: {artworks.length})
                </div>
                {selectedArtworks.length > 0 && (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      {selectedArtworks.length} artwork
                      {selectedArtworks.length !== 1 ? "s" : ""} selected
                    </span>
                    <button
                      onClick={handleBatchDelete}
                      className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                    >
                      Delete Selected
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {artworks.map((artwork: Artwork, index: number) => (
                  <div
                    key={artwork._id}
                    className="relative group bg-white rounded-lg shadow-md overflow-hidden aspect-square"
                  >
                    <div className="absolute top-2 left-2 z-10">
                      <input
                        type="checkbox"
                        checked={selectedArtworks.includes(artwork._id)}
                        onChange={() => toggleArtworkSelection(artwork._id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </div>
                    <div className="relative w-full h-full">
                      {artwork.thumbnailUrl &&
                      artwork.thumbnailUrl.trim() !== "" ? (
                        <Image
                          src={artwork.thumbnailUrl}
                          alt={artwork.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                          priority={index < 12}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                          <span className="text-gray-400">
                            No image available
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-200 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
                        <button
                          onClick={() => handleEdit(artwork)}
                          className="bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(artwork._id)}
                          className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-white bg-opacity-90">
                      <h3 className="font-semibold text-sm mb-1 truncate">
                        {artwork.title}
                      </h3>
                      <p className="text-xs text-gray-600 mb-1 truncate">
                        {artwork.category}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {artwork.medium} • {artwork.size}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Loading indicators */}
              {isLoadingMore && (
                <div className="flex justify-center items-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                </div>
              )}

              {/* Infinite scroll trigger */}
              {!isLoading && !isLoadingMore && hasMore && (
                <div ref={ref} className="h-10" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
