import mongoose, { Schema } from "mongoose";
import { TagDocument } from "./Tag";

export interface ArtworkDocument extends mongoose.Document {
  _id: string;
  name: string;
  description: string;
  src: string;
  thumbSrc: string;
  alt: string;
  medium: mongoose.Types.ObjectId;
  size: mongoose.Types.ObjectId;
  metaWidth: number;
  metaHeight: number;
  categories: mongoose.Types.ObjectId[];
}

const ArtworkSchema = new mongoose.Schema<ArtworkDocument>({
  name: {
    type: String,
    unique: true,
    maxlength: [60, "Name cannot be more than 60 characters long"],
  },
  description: {
    type: String,
    maxlength: [255, "Description cannot be more than 255 characters long"],
  },
  src: {
    type: String,
    maxlength: [255, "Source cannot be more than 255 characters long"],
  },
  thumbSrc: {
    type: String,
    maxlength: [255, "Source cannot be more than 255 characters long"],
  },
  alt: {
    type: String,
    maxlength: [255, "Alt text cannot be more than 255 characters long"],
  },
  medium: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tag",
  },
  size: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tag",
  },
  metaWidth: {
    type: Number,
  },
  metaHeight: { 
    type: Number 
  },
  categories: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tag",
    },
  ],
});

export default mongoose.models.Artwork || mongoose.model<ArtworkDocument>("Artwork", ArtworkSchema);

// Extended type for populated categories:
export type PopulatedArtworkDocument = Omit<
  ArtworkDocument,
  "categories" | "medium" | "size"
> & {
  categories: TagDocument[];
  medium: TagDocument;
  size: TagDocument;
};
