"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Tag {
  _id: string;
  label: string;
  type: "category" | "medium" | "size";
}

interface TagManagerProps {
  type: "category" | "medium" | "size";
  title: string;
  onTagsChange?: () => void;
}

function TagForm({
  type,
  onAdd,
}: {
  type: string;
  onAdd: (label: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isSubmitting) return;

    const tagToAdd = value.trim();
    setValue("");

    try {
      setIsSubmitting(true);
      await onAdd(tagToAdd);
    } catch (error) {
      console.error("Error adding tag:", error);
      setValue(tagToAdd);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Add new ${type}`}
          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          autoComplete="off"
        />
        <button
          type="submit"
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50"
          disabled={isSubmitting || !value.trim()}
        >
          {isSubmitting ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}

export default function TagManager({
  type,
  title,
  onTagsChange,
}: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadTags = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/tags?type=${type}`);
        if (!response.ok) throw new Error("Failed to fetch tags");
        const data = await response.json();
        setTags(data);
      } catch (error) {
        console.error("Error loading tags:", error);
        toast.error("Failed to load tags");
      } finally {
        setIsLoading(false);
      }
    };

    loadTags();
  }, [type]);

  const handleAdd = async (label: string) => {
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, type }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to create tag");
    }

    const newTagData = await response.json();
    setTags((prevTags) => [...prevTags, newTagData]);
    toast.success("Tag created successfully");
    onTagsChange?.();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tag?") || isDeleting)
      return;

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/tags/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete tag");
      }

      setTags((prevTags) => prevTags.filter((tag) => tag._id !== id));
      toast.success("Tag deleted successfully");
      onTagsChange?.();
    } catch (error) {
      console.error("Error deleting tag:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete tag"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>

      <TagForm type={type} onAdd={handleAdd} />

      <div className="space-y-2">
        {tags.map((tag) => (
          <div
            key={tag._id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
          >
            <span className="text-gray-900">{tag.label}</span>
            <button
              onClick={() => handleDelete(tag._id)}
              className="text-red-600 hover:text-red-700 disabled:opacity-50"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
