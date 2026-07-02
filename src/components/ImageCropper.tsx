import React, { useState, useRef, useCallback } from "react";
import ReactCrop, {
  Crop,
  PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
  onCancel: () => void;
  aspect?: number;
  title?: string;
  maxOutputWidth?: number;
  maxOutputHeight?: number;
  outputMimeType?: "image/jpeg" | "image/png" | "image/webp";
  outputQuality?: number;
}

const getPixelCrop = (
  image: HTMLImageElement,
  sourceCrop?: Crop,
): PixelCrop | undefined => {
  if (!sourceCrop?.width || !sourceCrop?.height) return undefined;

  if (sourceCrop.unit === "%") {
    return {
      unit: "px",
      x: ((sourceCrop.x || 0) / 100) * image.width,
      y: ((sourceCrop.y || 0) / 100) * image.height,
      width: (sourceCrop.width / 100) * image.width,
      height: (sourceCrop.height / 100) * image.height,
    };
  }

  return {
    unit: "px",
    x: sourceCrop.x || 0,
    y: sourceCrop.y || 0,
    width: sourceCrop.width,
    height: sourceCrop.height,
  };
};

const fitInsideBounds = (
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) => {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const canvasToDataUrl = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
) =>
  new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not create cropped image."));
          return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read cropped image."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      },
      mimeType,
      quality,
    );
  });

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
  aspect,
  title = "Media",
  maxOutputWidth = 1600,
  maxOutputHeight = 1600,
  outputMimeType,
  outputQuality = 0.9,
}) => {
  const [crop, setCrop] = useState<Crop>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const completedCropRef = useRef<PixelCrop>();

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const image = e.currentTarget;
      const { naturalWidth: nw, naturalHeight: nh } = image;
      const initial = aspect
        ? centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect, nw, nh), nw, nh)
        : centerCrop({ unit: "%", width: 90, height: 90 }, nw, nh);

      setCrop(initial);
      completedCropRef.current = getPixelCrop(image, initial);
    },
    [aspect],
  );

  const handleCrop = async () => {
    const image = imgRef.current;
    if (!image) {
      onCropComplete(imageSrc);
      return;
    }

    const activeCrop = completedCropRef.current || getPixelCrop(image, crop);
    if (!activeCrop || activeCrop.width === 0 || activeCrop.height === 0) {
      onCropComplete(imageSrc);
      return;
    }

    setIsProcessing(true);
    setError("");

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const rawOutputW = Math.round(activeCrop.width * scaleX);
    const rawOutputH = Math.round(activeCrop.height * scaleY);
    const { width: outputW, height: outputH } = fitInsideBounds(
      rawOutputW,
      rawOutputH,
      maxOutputWidth,
      maxOutputHeight,
    );

    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onCropComplete(imageSrc);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      activeCrop.x * scaleX,
      activeCrop.y * scaleY,
      activeCrop.width * scaleX,
      activeCrop.height * scaleY,
      0,
      0,
      outputW,
      outputH,
    );

    try {
      const mime =
        outputMimeType ||
        (imageSrc.startsWith("data:image/png") ? "image/png" : "image/jpeg");
      const result = await canvasToDataUrl(
        canvas,
        mime,
        mime === "image/png" ? undefined : outputQuality,
      );
      onCropComplete(result);
    } catch (cropError: any) {
      setError(cropError?.message || "Could not crop this image.");
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: "min(740px, 98vw)", width: "100%", maxHeight: "95dvh" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h3 className="text-base font-bold text-stone-800">{title}</h3>
        </div>

        <div
          className="flex-1 overflow-auto flex items-center justify-center bg-stone-100 p-3"
          style={{ minHeight: 260 }}
        >
          <ReactCrop
            crop={crop}
            onChange={(_, pct) => setCrop(pct)}
            onComplete={(px) => {
              completedCropRef.current = px;
            }}
            aspect={aspect}
            ruleOfThirds
            style={{ maxHeight: "65dvh" }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              onLoad={onImageLoad}
              alt="Crop"
              decoding="async"
              style={{
                maxHeight: "65dvh",
                maxWidth: "100%",
                display: "block",
                userSelect: "none",
              }}
            />
          </ReactCrop>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-stone-100">
          {error ? (
            <p className="mr-auto text-xs font-medium text-red-500">{error}</p>
          ) : (
            <div className="mr-auto" />
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="px-5 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCrop}
            disabled={isProcessing}
            className="min-w-24 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
            style={{ background: "#0088ff" }}
          >
            {isProcessing ? "Cropping..." : "Crop"}
          </button>
        </div>
      </div>
    </div>
  );
};
