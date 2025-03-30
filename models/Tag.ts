import mongoose, { Schema, Document } from "mongoose";
import { TagType } from "@/types/tagType";

export interface TagDocument extends Document {
  _id: string;
  label: string;
  type: TagType;
}

const TagSchema = new Schema<TagDocument>(
  {
    label: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      enum: [TagType.CATEGORY, TagType.MEDIUM, TagType.SIZE],
    },
  },
  { timestamps: true }
);

TagSchema.index({ label: 1, type: 1 }, { unique: true });

export default mongoose.models.Tag ||
  mongoose.model<TagDocument>("Tag", TagSchema);
