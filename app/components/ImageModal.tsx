import Image from "next/image";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  description: string;
}

export default function ImageModal({
  isOpen,
  onClose,
  imageUrl,
  title,
  description,
}: ImageModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="relative max-w-4xl w-full mx-4">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300"
        >
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <div className="bg-white rounded-lg overflow-hidden">
          <div className="relative aspect-[4/3]">
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
              priority
            />
          </div>
          <div className="p-4">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {title}
            </h3>
            <p className="text-gray-600">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
