"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Artwork } from "@/types/gallery";
import { Tag } from "@/types/tag";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 12;

const artworkSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  medium: z.string().optional(),
  size: z.string().optional(),
  year: z.string().optional(),
});

type ArtworkFormData = z.infer<typeof artworkSchema>;

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isBatchUpload, setIsBatchUpload] = useState(false);
  const [categories, setCategories] = useState<Tag[]>([]);
  const [mediums, setMediums] = useState<Tag[]>([]);
  const [sizes, setSizes] = useState<Tag[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
  } = useForm<ArtworkFormData>({
    resolver: zodResolver(artworkSchema),
  });

  // Watch form values for debugging
  const formValues = watch();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      loadArtworks();
      loadTags();
    }
  }, [session, currentPage]);

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

  const loadArtworks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/gallery?page=${currentPage}&limit=${ITEMS_PER_PAGE}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch artworks");
      }
      const data = await response.json();
      setArtworks(data.artworks || []);
      setTotalPages(Math.ceil((data.total || 0) / ITEMS_PER_PAGE));
    } catch (error) {
      console.error("Error loading artworks:", error);
      toast.error("Failed to load artworks");
      setArtworks([]);
    } finally {
      setIsLoading(false);
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

  const onSubmit = async (data: ArtworkFormData) => {
    try {
      setIsUploading(true);

      if (isEditing && editingArtwork) {
        // Handle update
        const response = await fetch(`/api/gallery/${editingArtwork._id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 403) {
            throw new Error(
              "You don't have permission to perform this action. Please contact an administrator."
            );
          }
          throw new Error(errorData.error || "Failed to update artwork");
        }

        toast.success("Artwork updated successfully");
        // First load the updated artworks
        await loadArtworks();
        // Then reset the form state
        resetForm();
      } else {
        // Handle upload
        const fileInput = document.getElementById("file") as HTMLInputElement;
        const files = fileInput?.files;

        if (!files?.length) {
          toast.error("Please select at least one file");
          return;
        }

        setTotalFiles(files.length);
        setProcessedFiles(0);
        let successCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const formData = new FormData();
          formData.append("file", file);

          // For batch upload, use the file's name as the title
          const artworkData = {
            ...data,
            title: isBatchUpload
              ? file.name.replace(/\.[^/.]+$/, "")
              : data.title || file.name.replace(/\.[^/.]+$/, ""),
          };

          formData.append("data", JSON.stringify(artworkData));
          formData.append("isBatchUpload", isBatchUpload.toString());

          try {
            const response = await fetch("/api/gallery", {
              method: "POST",
              body: formData,
            });

            const responseData = await response.json();

            if (!response.ok) {
              if (response.status === 403) {
                throw new Error(
                  "You don't have permission to perform this action. Please contact an administrator."
                );
              }
              throw new Error(
                responseData.error || `Failed to upload ${file.name}`
              );
            }

            successCount++;
            setProcessedFiles(i + 1);
            setUploadProgress(((i + 1) / files.length) * 100);
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.includes("don't have permission")
            ) {
              toast.error(error.message);
            } else {
              toast.error(`Failed to upload ${file.name}`);
            }
            break; // Stop processing other files if we hit a permission error
          }
        }

        if (successCount > 0) {
          toast.success(
            `Successfully uploaded ${successCount} of ${files.length} artworks`
          );
          // First load the updated artworks
          await loadArtworks();
          // Then reset the form state
          resetForm();
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setIsUploading(false);
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
      } catch (e) {
        // If we can't parse the response as JSON, use the default error message
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

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
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
          onSubmit={handleSubmit(async (data) => {
            try {
              await onSubmit(data);
            } catch (error) {
              console.error("Form submission error:", error);
              if (error instanceof Error) {
                toast.error(error.message);
              } else {
                toast.error(
                  "You don't have permission to perform this action. Please contact an administrator."
                );
              }
            }
          })}
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
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : artworks.length === 0 ? (
          <div className="text-center text-gray-500">No artworks found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {artworks.map((artwork) => (
              <div
                key={artwork._id}
                className="bg-white rounded-lg shadow-md overflow-hidden"
              >
                <div className="relative aspect-square">
                  <Image
                    src={artwork.thumbnailUrl}
                    alt={artwork.title}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-50 transition-opacity duration-200 flex items-center justify-center">
                    <div className="opacity-0 hover:opacity-100 transition-opacity duration-200 flex gap-2">
                      <button
                        onClick={() => handleEdit(artwork)}
                        className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(artwork._id)}
                        className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-1">
                    {artwork.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    {artwork.category}
                  </p>
                  <p className="text-sm text-gray-500">
                    {artwork.medium} • {artwork.size}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
